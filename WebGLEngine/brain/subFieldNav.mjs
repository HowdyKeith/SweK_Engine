// WebGLEngine/brain/subFieldNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subFieldNav-selfcheck.mjs)
//
// FLOW-FIELD WAYPOINTS FOR THE SUBMARINE: a guidance layer that turns the brain's flow field (brain/flowfieldCpu.js, an exact Dijkstra over a cost grid) into the heading the PD autopilot (brain/autopilotSub.mjs) is asked to hold, in a
// plan-view region with full-depth OBSTACLE DISCS between the vessel and its waypoint, in still water and in a current. brain/missionTask.mjs flies a waypoint mission by pointing the autopilot STRAIGHT at the waypoint and says "obstacles are
// NOT modelled"; this models them, and flies three guidance arms through the same scenarios:
//   straight      the waypoint mission's own guidance: the bearing to the waypoint
//   field-cell    the heading of the flow vector at the cell the vessel is in (a zero flow -- the goal cell, a blocked or unreachable cell -- falls back to the straight bearing)
//   field-smooth  the same with the flow vector blended bilinearly from the four surrounding cell centres (empty blend -> field-cell -> straight)
// THE FIELD: a 96 x 56 grid of 5 m cells over x in [-40, 440], y in [-140, 140]. A cell whose centre is within a disc's radius + 4 m half-hull + a MARGIN (6 m as registered; swept on DEV by Amendment 1) of the disc's centre is BLOCKED (height 40; free cells are height 20,
// above the solver's water level of 8, so there is no water penalty); with impassDh = 10 no shortest path crosses a blocked cell (the maze page's use of the solver). Solved ONCE per scenario from the waypoint's cell. It does not know the
// current, the vessel's turning radius or the hull beyond the inflation.
// OPTIMISTIC, said plainly: THE VESSEL KNOWS WHERE IT IS (a perfect position fix, as in the waypoint mission) AND THE MAP OF THE OBSTACLES IS EXACT AND STATIC.
// Pure: no DOM, no clock, no Math.random (the scenario is a function of its seed).
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import { FlowFieldSolverCPU } from "./flowfieldCpu.js";

export const REGION = Object.freeze({ x0: -40, x1: 440, y0: -140, y1: 140 });
export const CELL = 5, GRID_W = 96, GRID_H = 56;
export const HULL_HALF = 4, MARGIN = 6;   // MARGIN 6 m is the REGISTERED margin beyond the half-hull (brain/SUB_FIELD_NAV_WIP.md); Amendment 1 sweeps it on the DEV set (MARGINS)
export const ROUTE_MARGIN = MARGIN, MARGINS = Object.freeze([6, 12, 18, 24, 30, 36]);   // a route exists at ROUTE_MARGIN for every seed measured (the gate asserts it); a wider margin may close a gap, and the field then says so (noRoute)
export const FREE_H = 20, BLOCKED_H = 40, IMPASS_DH = 10;
export const SECONDS = 200, BLOCK_LINE = 14, CRUISE = MT.CRUISE;
export const KINDS = Object.freeze(["nav", "nav-current"]);
export const ARMS = Object.freeze(["straight", "field-cell", "field-smooth"]);
export const BIG = 1e9;
// THE ARRIVAL RULE (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP: THE ARRIVAL RULE", registered before it was built): inside ARRIVAL_RADIUS of the waypoint a field arm steers on the STRAIGHT BEARING instead of the field's heading ("+approach"), and
// with "+slow" also drops its speed target to ARRIVAL_SLOW. 30 m is derived: every disc's edge is at least 40 m from the waypoint (the generator's r + 40), so the straight segment from anywhere inside 30 m cannot cross a disc.
export const ARRIVAL_RADIUS = 30, ARRIVAL_SLOW = 1.5;
export const ARRIVAL_ARMS = Object.freeze(["field-cell", "field-smooth"].flatMap((a) => [a + "+approach", a + "+approach+slow"]));
export const ALL_ARMS = Object.freeze([...ARMS, ...ARRIVAL_ARMS]);
// THE SMOOTHER HEADING (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 2", registered before it was built): "field-any" steers on the bearing to an ANY-ANGLE AIM POINT -- for each reached cell the farthest point along the field's grid path that is visible in a straight line
// through unblocked cells (Theta*'s rule, built once per field by buildAim) -- so in an open sea every cell aims at the waypoint and round an obstacle the aim point is a corner of the inflated zone. "field-any+approach" adds the arrival rule.
export const ANY_ARMS = Object.freeze(["field-any", "field-any+approach"]);
export const EVERY_ARM = Object.freeze([...ALL_ARMS, ...ANY_ARMS]);
export const AIM_STEP = 2;   // metres between the samples of a line-of-sight test (the cell is 5 m)
/** An arm name taken apart: { base ("straight" | "field-cell" | "field-smooth"), approach, slow }; throws, naming every arm, on one that is not in ALL_ARMS. */
export function parseArm(arm, who = "subFieldNav.parseArm") {
    if (!EVERY_ARM.includes(arm)) throw new Error(`${who}: unknown arm "${arm}" (${EVERY_ARM.join(", ")})`);
    const approach = arm.includes("+approach");
    return { base: approach ? arm.slice(0, arm.indexOf("+")) : arm, approach, slow: arm.endsWith("+slow") };
}

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The distance from point (px, py) to the segment (ax, ay)-(bx, by). */
export function segmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Is the straight segment from the start to the waypoint within (r + BLOCK_LINE) m of any disc's centre? */
export const isBlocked = (start, goal, discs) => discs.some((d) => segmentDistance(d.x, d.y, start.x, start.y, goal.x, goal.y) <= d.r + BLOCK_LINE);

/** The cell of (x, y), or null outside the grid: { gx, gy, i }. */
export function cellOf(field, x, y) {
    const gx = Math.floor((x - field.x0) / field.cell), gy = Math.floor((y - field.y0) / field.cell);
    return gx < 0 || gy < 0 || gx >= field.w || gy >= field.h ? null : { gx, gy, i: gy * field.w + gx };
}

/** Is the straight segment from (x0, y0) to (x1, y1) inside the grid and clear of every BLOCKED cell? Sampled every AIM_STEP m, both ends included. */
export function lineClear(field, x0, y0, x1, y1) {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / AIM_STEP));
    for (let i = 0; i <= n; i++) { const c = cellOf(field, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); if (!c || field.blocked[c.i]) return false; }
    return true;
}
/**
 * The any-angle aim points of a field: { ax, ay } (Float64Array per cell, NaN where a cell has none). Cells are processed in increasing distance from the waypoint; the waypoint's own cell aims at the waypoint; any other reached cell takes its next cell's aim point when the straight
 * segment from its own centre to that point is clear (lineClear), and the next cell's centre when it is not. A cell that is blocked, unreached, without a flow, or whose next cell has no aim point has none.
 */
export function buildAim(field, goal) {
    const { w, h, dist, fx, fz, blocked } = field, ax = new Float64Array(w * h).fill(NaN), ay = new Float64Array(w * h).fill(NaN), order = [];
    for (let i = 0; i < w * h; i++) if (!blocked[i] && dist[i] < BIG) order.push(i);
    order.sort((p, q) => dist[p] - dist[q] || p - q);
    const goalIndex = field.goalCell.gy * w + field.goalCell.gx, cx = (i) => field.x0 + ((i % w) + 0.5) * field.cell, cy = (i) => field.y0 + (((i / w) | 0) + 0.5) * field.cell;
    const off = (v) => (v * Math.SQRT2 > 0.5 ? 1 : v * Math.SQRT2 < -0.5 ? -1 : 0);
    for (const i of order) {
        if (i === goalIndex) { ax[i] = goal.x; ay[i] = goal.y; continue; }
        const sx = off(fx[i]), sy = off(fz[i]); if (sx === 0 && sy === 0) continue;
        const nx = (i % w) + sx, ny = ((i / w) | 0) + sy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx; if (blocked[n] || !(dist[n] < dist[i]) || Number.isNaN(ax[n])) continue;
        if (lineClear(field, cx(i), cy(i), ax[n], ay[n])) { ax[i] = ax[n]; ay[i] = ay[n]; } else { ax[i] = cx(n); ay[i] = cy(n); }
    }
    return { ax, ay };
}
const AIMS = new WeakMap();
/** The aim points of a field for a waypoint, built the first time and kept with the field (a different waypoint rebuilds them). */
export function aimOf(field, goal) {
    const hit = AIMS.get(field);
    if (hit && hit.x === goal.x && hit.y === goal.y) return hit.aim;
    const aim = buildAim(field, goal); AIMS.set(field, { x: goal.x, y: goal.y, aim }); return aim;
}
/** The heading (atan2(-dy, dx)) from (x, y) to the aim point of the cell holding it, or null when the cell has none, the point is outside the grid, or the vessel is on the aim point. */
export function aimHeading(field, aim, x, y) {
    const c = cellOf(field, x, y); if (!c || Number.isNaN(aim.ax[c.i])) return null;
    const dx = aim.ax[c.i] - x, dy = aim.ay[c.i] - y;
    return dx === 0 && dy === 0 ? null : Math.atan2(-dy, dx);
}

/** The field for a scenario's discs and waypoint at `margin` m beyond the half-hull: { w, h, cell, x0, y0, margin, fx, fz, dist, blocked (Uint8Array), goalCell }. */
export function buildField(sc, { margin = MARGIN } = {}) {
    const inflate = HULL_HALF + margin;
    const w = GRID_W, h = GRID_H, heights = new Float32Array(w * h).fill(FREE_H), blocked = new Uint8Array(w * h);
    for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
        const cx = REGION.x0 + (gx + 0.5) * CELL, cy = REGION.y0 + (gy + 0.5) * CELL;
        if (sc.discs.some((d) => Math.hypot(cx - d.x, cy - d.y) <= d.r + inflate)) { heights[gy * w + gx] = BLOCKED_H; blocked[gy * w + gx] = 1; }
    }
    const field = { w, h, cell: CELL, x0: REGION.x0, y0: REGION.y0, margin, blocked };
    const g = cellOf(field, sc.goal.x, sc.goal.y), solver = new FlowFieldSolverCPU(null, w, h, { cell: CELL, impassDh: IMPASS_DH });
    const out = solver.solveSync(heights, [{ gx: g.gx, gy: g.gy }], { wantFlow: true, wantDist: true });
    return { ...field, fx: out.fx, fz: out.fz, dist: out.dist, goalCell: { gx: g.gx, gy: g.gy } };
}

/**
 * A scenario: { seed, kind, start { x, y, depth, speed, pitch, bank, heading }, goal { x, y, depth }, discs [{ x, y, r }], blocked, current, weightError }. Discs keep 24 m of clear water between them and (r + 40) m from the waypoint (and from the start, which the
 * ranges guarantee). THAT A ROUTE EXISTS in the field at ROUTE_MARGIN is not enforced here but MEASURED: over seeds 1 to 3000 no layout cut the vessel off (a reject-and-redraw guard that was written first never fired and was removed), and the
 * gate asserts it for the DEV and HELD seeds.
 */
export function navScenario(seed, kind = "nav") {
    if (!KINDS.includes(kind)) throw new Error(`subFieldNav.navScenario: unknown kind "${kind}" (${KINDS.join(", ")})`);
    const r = mulberry((seed * 7919 + KINDS.indexOf(kind) * 104729 + 971) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const start = { x: u(0, 20), y: u(-40, 40), depth: u(20, 30), speed: u(2, 3), pitch: u(-0.05, 0.05), bank: u(-0.08, 0.08), heading: 0 };
    const goal = { x: u(360, 400), y: u(-80, 80), depth: u(15, 40) };
    const K = 3 + Math.floor(r() * 4), placed = [];
    for (let tries = 0; tries < 2000 && placed.length < K; tries++) {
        const d = { r: u(14, 28), x: u(90, 310), y: u(-110, 110) };
        if (Math.hypot(d.x - goal.x, d.y - goal.y) < d.r + 40) continue;   // (the start needs no test: its x is at most 20 and a centre's at least 90, so 70 m apart at the least, and r + 40 is 68 at the most)
        if (placed.some((p) => Math.hypot(d.x - p.x, d.y - p.y) < d.r + p.r + 24)) continue;
        placed.push(d);
    }
    const discs = placed.map((d) => Object.freeze({ x: d.x, y: d.y, r: d.r }));
    let current = null, weightError = 0;
    if (kind === "nav-current") {
        const mean = [u(-0.4, 0.4), u(-0.4, 0.4), u(-0.05, 0.05)], amp = [u(0.05, 0.15), u(0.05, 0.15), u(0.02, 0.06)];
        current = Object.freeze({ mean, amp, freq: [[u(0.1, 0.25), u(0.5, 0.9)], [u(0.1, 0.25), u(0.5, 0.9)], [u(0.15, 0.3), u(0.6, 1.0)]], phase: [[u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)]] });
        weightError = u(-0.006, 0.006);
    }
    return Object.freeze({ seed, kind, start: Object.freeze(start), goal: Object.freeze(goal), discs: Object.freeze(discs), blocked: isBlocked(start, goal, discs), current, weightError });
}

/**
 * The heading (engine convention: 0 = +x, a right turn increases it, atan2(-dy, dx)) the field gives at (x, y), or null when it gives none. mode "cell": the nearest cell's flow vector. mode "smooth": the four surrounding cell
 * centres' vectors blended bilinearly (a corner outside the grid counts as no flow), falling back to "cell" when the blend is empty.
 */
export function fieldHeading(field, x, y, mode = "cell") {
    const c = cellOf(field, x, y);
    const cellHeading = () => (c && (field.fx[c.i] !== 0 || field.fz[c.i] !== 0) ? Math.atan2(-field.fz[c.i], field.fx[c.i]) : null);
    if (mode === "cell") return cellHeading();
    if (mode !== "smooth") throw new Error(`subFieldNav.fieldHeading: unknown mode "${mode}" (cell, smooth)`);
    const qx = (x - field.x0) / field.cell - 0.5, qy = (y - field.y0) / field.cell - 0.5, i0 = Math.floor(qx), j0 = Math.floor(qy), tx = qx - i0, ty = qy - j0;
    let sx = 0, sz = 0;
    for (const [di, dj, wgt] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
        const gx = i0 + di, gy = j0 + dj;
        if (gx < 0 || gy < 0 || gx >= field.w || gy >= field.h) continue;
        sx += wgt * field.fx[gy * field.w + gx]; sz += wgt * field.fz[gy * field.w + gx];
    }
    return Math.hypot(sx, sz) < 1e-6 ? cellHeading() : Math.atan2(-sz, sx);
}

/** The target (depth, heading, speed) an arm gives the autopilot at a state: the waypoint's depth and the cruise speed always; the heading by the arm. `field` is the scenario's (null for straight). */
export function armTarget(arm, state, field, goal) {
    const a = parseArm(arm, "subFieldNav.armTarget"), straight = MT.waypointTarget(state, goal, CRUISE);
    if (a.base === "straight") return straight;
    if (a.approach && Math.hypot(goal.x - state.pos[0], goal.y - state.pos[1]) <= ARRIVAL_RADIUS) return a.slow ? { ...straight, speed: ARRIVAL_SLOW } : straight;
    let h;
    if (a.base === "field-any") { h = aimHeading(field, aimOf(field, goal), state.pos[0], state.pos[1]); if (h === null) h = fieldHeading(field, state.pos[0], state.pos[1], "cell"); }
    else h = fieldHeading(field, state.pos[0], state.pos[1], a.base === "field-smooth" ? "smooth" : "cell");
    return h === null ? straight : { ...straight, heading: h };
}

let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));   // no floor: the obstacles are the thing in the water

/** The least distance from (x, y) to any disc's edge, less the half-hull (negative: touching). */
export const clearanceAt = (discs, x, y) => discs.reduce((m, d) => Math.min(m, Math.hypot(x - d.x, y - d.y) - d.r - HULL_HALF), Infinity);

/**
 * Fly one scenario with `pilot` ((state, target, current) -> controls) under `arm`. Returns { arm, kind, seed, blocked, status ("reached" | "collided" | "left" | "timeout" | the vessel's own: "broached", "grounded", "crushed", "lost"),
 * reached, t (seconds at arrival, else null), path (m flown on the plane), minClearance (m), ticks, margin (the field's, null for straight), noRoute (the field cannot reach the waypoint from the start's cell: the arm
 * then falls back to the straight bearing) }. `field` may be handed in (the scenario's, built once for the arms that need it); `margin` is the field's margin beyond the half-hull when it is built here. Deterministic.
 */
export function fly(pilot, sc, arm, { seconds = SECONDS, dt = S.DT, model = navModel(), field = null, margin = MARGIN } = {}) {
    const base = parseArm(arm, "subFieldNav.fly").base;
    const f = base === "straight" ? null : field || buildField(sc, { margin }), total = Math.round(seconds / dt), st = sc.start;
    const sc0 = f ? cellOf(f, st.x, st.y) : null, noRoute = f ? !(sc0 && f.dist[sc0.i] < BIG) : false;
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    let status = "timeout", path = 0, minClear = clearanceAt(sc.discs, st.x, st.y), ticks = 0, t = null;
    for (let i = 0; i < total; i++) {
        const target = armTarget(arm, s, f, sc.goal), cv = ST.currentAt(sc.current, i * dt), cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError);
        const px = s.pos[0], py = s.pos[1];
        s = res.state; ticks++;
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1];
        path += Math.hypot(x - px, y - py);
        const clear = clearanceAt(sc.discs, x, y);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; break; }
        if (x < REGION.x0 || x > REGION.x1 || y < REGION.y0 || y > REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = (i + 1) * dt; break; }
    }
    return { arm, kind: sc.kind, seed: sc.seed, blocked: sc.blocked, status, reached: status === "reached", t, path, minClearance: minClear, ticks, margin: f ? f.margin : null, noRoute };
}

/** The scenarios of a set: its seeds of each kind, frozen. DEV seeds 1..30 (1..12 as first registered, widened by Amendment 1), HELD seeds 101..160 and HELD2 seeds 201..260, the arrival rule's, and HELD3 seeds 301..360, the smoother heading's (brain/SUB_FIELD_NAV_WIP.md). */
export const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const SETS = Object.freeze({ dev: range(1, 30), held: range(101, 160), held2: range(201, 260), held3: range(301, 360) });   // held2: the arrival rule's set (the follow-up), read once
export const setOf = (name) => { if (!SETS[name]) throw new Error(`subFieldNav.setOf: unknown set "${name}" (${Object.keys(SETS).join(", ")})`); return Object.freeze(KINDS.flatMap((k) => SETS[name].map((s) => navScenario(s, k)))); };

/** Every arm over a set of scenarios: the list of fly() results, scenario by scenario (the field is built once per scenario). */
export function evaluate(pilot, scenarios, arms = ARMS, opts = {}) {
    const runs = [];
    for (const sc of scenarios) { const field = arms.some((a) => a !== "straight") ? buildField(sc, { margin: opts.margin === undefined ? MARGIN : opts.margin }) : null; for (const arm of arms) runs.push(fly(pilot, sc, arm, { ...opts, field })); }
    return runs;
}
