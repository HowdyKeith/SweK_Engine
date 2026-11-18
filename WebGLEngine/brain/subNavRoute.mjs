// WebGLEngine/brain/subNavRoute.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "ITEM 2, PART 2: THE CURRENT IN THE COST" of brain/NAV_PLUS_WIP.md, written before this
// file; the gates are brain/subNavRoute-selfcheck.mjs and brain/flowfieldDirectional-selfcheck.mjs; the study is tools/ship/subNavRouteStudy.mjs)
//
// A PLAN THAT KNOWS THE CURRENT. The hard-stream kind (the islands of hard-current with a steady STREAM in place of its uniform current), the plan built by brain/flowfieldDirectional.mjs
// in a current map, its time-aware aim points, and the two registered arms, flown through brain/subNavPlus.mjs's flyPlus (its options; subHardNav and flowfieldCpu are NOT edited).
// OPTIMISTIC, said plainly: the route arm's plan READS THE STREAM'S MAP (an atlas), as every arm reads the static map exactly; both arms crab on the vessel's own estimate.
// Pure: no DOM, no clock, no Math.random (a scenario is a function of its seed).
"use strict";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import * as P from "./subNavPlus.mjs";
import * as D from "./flowfieldDirectional.mjs";

export const STREAM_KIND = "hard-stream", V_PLAN = N.CRUISE;
export const ROUTE_SETS = Object.freeze({ dev: N.range(1, 30), held86: N.range(9301, 9500), dev3: N.range(901, 930), held87: N.range(9501, 9700) });   // dev3 and held87: ITEM 2 PART 3 (the conditional reading)
export const ROUTE_ARMS = Object.freeze(["any+crab", "any+crab+route"]), ROUTE_REFERENCE = "any+crab", ROUTE_DESIGNATED = "any+crab+route";

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** The stream's current at (x, y): S cos^2(pi d / 2w) along (cos theta, sin theta) within the half-width w of the centre line (d the signed distance from it), 0 outside; [cx, cy, 0]. */
export function streamAt(st, x, y) {
    if (!st || st.speed === 0) return [0, 0, 0];
    const ux = Math.cos(st.theta), uy = Math.sin(st.theta), d = -(x - st.px) * uy + (y - st.py) * ux;
    if (Math.abs(d) >= st.halfWidth) return [0, 0, 0];
    const k = Math.cos((Math.PI * d) / (2 * st.halfWidth)), s = st.speed * k * k;
    return [s * ux, s * uy, 0];
}
/** A hard-stream scenario: hard-current's start, waypoint, islands, icebergs and weight error for the seed, its uniform current dropped, and a stream { theta, px, py, halfWidth, speed } drawn from mulberry(seed x 7919 + 90001) in the registered order. `speedScale` (default 1) is for check 2: 0 is still water. */
export function streamScenario(seed, { speedScale = 1 } = {}) {
    const base = H.hardScenario(seed, "hard-current"), r = mulberry((seed * 7919 + 90001) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const theta = u(0, 2 * Math.PI), px = u(120, 280), py = u(-60, 60), halfWidth = u(25, 45), speed = u(1.2, 2.2) * speedScale;
    const stream = Object.freeze({ theta, px, py, halfWidth, speed });
    return Object.freeze({ ...base, kind: STREAM_KIND, current: null, stream, currentMean: speed });
}
export const streamSetOf = (name, o) => { if (!ROUTE_SETS[name]) throw new Error(`subNavRoute.streamSetOf: unknown set "${name}" (${Object.keys(ROUTE_SETS).join(", ")})`); return Object.freeze(ROUTE_SETS[name].map((s) => streamScenario(s, o))); };

/** subHardNav.buildHardField's field (its geometry, to the cell) re-solved by the directional solver in `currentAt(x, y)` at speed V. */
export function buildRouteField(shapes, goal, { currentAt = null, V = V_PLAN, ...o } = {}) {
    const f = H.buildHardField(shapes, goal, o), r = D.solveDirectional(f, f.blocked, [f.goalCell], { currentAt, V });
    return { ...f, dist: r.dist, fx: r.fx, fz: r.fz, currentAt, V };
}
/** subHardNav.buildLadderField's rule (the first margin of the ladder that leaves a route from `from`) with buildRouteField. */
export function buildRouteLadder(shapes, goal, from, { ladder = H.MARGIN_LADDER, ...o } = {}) {
    let f = null;
    for (const m of ladder) { f = buildRouteField(shapes, goal, { ...o, margin: m }); const c = N.cellOf(f, from.x, from.y); if (c && f.dist[c.i] < N.BIG) return f; }
    return f;
}

/** The time (still-water metres) to run the straight segment (x0, y0) -> (x1, y1), sampled every AIM_STEP at the current there; Infinity if any piece cannot be made good. */
export function segmentTime(x0, y0, x1, y1, currentAt, V = V_PLAN) {
    const len = Math.hypot(x1 - x0, y1 - y0); if (len === 0) return 0;
    const n = Math.max(1, Math.ceil(len / N.AIM_STEP)), dx = (x1 - x0) / len, dy = (y1 - y0) / len, piece = len / n; let t = 0;
    for (let i = 0; i < n; i++) {
        const c = currentAt ? currentAt(x0 + (x1 - x0) * (i + 0.5) / n, y0 + (y1 - y0) * (i + 0.5) / n) : null;
        const k = D.stepCost(piece, dx, dy, c ? c[0] : 0, c ? c[1] : 0, V); if (k === Infinity) return Infinity; t += k;
    }
    return t;
}
/**
 * The time-aware aim points (the registration's rule): buildAim's (subFieldNav), with one more condition for taking the next cell's aim point -- the straight segment's time (segmentTime) is no
 * more than the plan's time from the cell to that point (its dist less the point's) plus one cell. With no current they are buildAim's bit for bit (the gate holds it on 40 fields).
 */
export function buildTimedAim(field, goal) {
    const { w, h, dist, fx, fz, blocked, currentAt, V } = field, ax = new Float64Array(w * h).fill(NaN), ay = new Float64Array(w * h).fill(NaN), ad = new Float64Array(w * h).fill(NaN), order = [];
    for (let i = 0; i < w * h; i++) if (!blocked[i] && dist[i] < N.BIG) order.push(i);
    order.sort((p, q) => dist[p] - dist[q] || p - q);
    const goalIndex = field.goalCell.gy * w + field.goalCell.gx, cx = (i) => field.x0 + ((i % w) + 0.5) * field.cell, cy = (i) => field.y0 + (((i / w) | 0) + 0.5) * field.cell;
    const off = (v) => (v * Math.SQRT2 > 0.5 ? 1 : v * Math.SQRT2 < -0.5 ? -1 : 0);
    for (const i of order) {
        if (i === goalIndex) { ax[i] = goal.x; ay[i] = goal.y; ad[i] = 0; continue; }
        const sx = off(fx[i]), sy = off(fz[i]); if (sx === 0 && sy === 0) continue;
        const nx = (i % w) + sx, ny = ((i / w) | 0) + sy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx; if (blocked[n] || !(dist[n] < dist[i]) || Number.isNaN(ax[n])) continue;
        let take = N.lineClear(field, cx(i), cy(i), ax[n], ay[n]);
        if (take) {
            const direct = segmentTime(cx(i), cy(i), ax[n], ay[n], currentAt, V);
            take = direct <= dist[i] - ad[n] + field.cell;
        }
        if (take) { ax[i] = ax[n]; ay[i] = ay[n]; ad[i] = ad[n]; } else { ax[i] = cx(n); ay[i] = cy(n); ad[i] = dist[n]; }
    }
    return { ax, ay };
}
const AIMS = new WeakMap();
/** The time-aware aim points of a field for a waypoint, kept with the field. */
export function timedAimOf(field, goal) {
    const hit = AIMS.get(field); if (hit && hit.x === goal.x && hit.y === goal.y) return hit.aim;
    const aim = buildTimedAim(field, goal); AIMS.set(field, { x: goal.x, y: goal.y, aim }); return aim;
}

/** The options of flyPlus for an arm on a stream scenario. Both arms: the vessel feels the stream at its position. The route arm: the plan built by the directional solver in the stream's map, and the time-aware aim points. */
export function routeOptions(sc, arm) {
    if (!ROUTE_ARMS.includes(arm)) throw new Error(`subNavRoute.routeOptions: unknown arm "${arm}" (${ROUTE_ARMS.join(", ")})`);
    const at = (x, y) => streamAt(sc.stream, x, y), o = { currentAt: (x, y) => streamAt(sc.stream, x, y) };
    if (arm === ROUTE_DESIGNATED) { o.planField = (shapes, goal, from, opts) => buildRouteLadder(shapes, goal, from, { ...opts, currentAt: at, V: V_PLAN }); o.aimOf = timedAimOf; }
    return o;
}
/** Fly one stream scenario under an arm: flyPlus("any+crab") with the arm's options. */
export const flyRoute = (pilot, sc, arm, o = {}) => ({ ...P.flyPlus(pilot, sc, "any+crab", { ...o, ...routeOptions(sc, arm) }), arm });

// ---- ITEM 2 PART 3: where the two plans differ -------------------------------------------------------------------------------------------------------------------------------------------------------------
export const CHAIN_STEPS = 400, CHAIN_EPS = 1e-6;
/** A plan's AIM CHAIN from (x, y): p0 = the point; p(k+1) = the aim point of the cell holding p(k); it stops at the waypoint, at a cell with no aim point (or outside the grid), at no progress, or after CHAIN_STEPS. Returns [[x, y], ...] including p0. */
export function aimChain(field, aim, x, y, goal) {
    const out = [[x, y]];
    for (let k = 0; k < CHAIN_STEPS; k++) {
        const [px, py] = out[out.length - 1], c = N.cellOf(field, px, py); if (!c) break;
        const ax = aim.ax[c.i], ay = aim.ay[c.i]; if (Number.isNaN(ax)) break;
        if (ax === px && ay === py) break;
        out.push([ax, ay]);
        if (ax === goal.x && ay === goal.y) break;
    }
    return out;
}
/** Do the two chains differ: a different number of points, or any point more than CHAIN_EPS m from its counterpart. */
export const chainsDiffer = (a, b) => a.length !== b.length || a.some((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) > CHAIN_EPS);
/** The registered predicate S for a stream scenario: both arms' t = 0 plans (the shared ladder with aimOf; the directional ladder in the stream's map with timedAimOf) walked from the start. { inS, ref, route } (the chains). */
export function planChains(sc) {
    const shapes = H.planShapes(sc, 0), at = (x, y) => streamAt(sc.stream, x, y), f0 = H.buildLadderField(shapes, sc.goal, sc.start), f1 = buildRouteLadder(shapes, sc.goal, sc.start, { currentAt: at, V: V_PLAN });
    const ref = aimChain(f0, N.aimOf(f0, sc.goal), sc.start.x, sc.start.y, sc.goal), route = aimChain(f1, timedAimOf(f1, sc.goal), sc.start.x, sc.start.y, sc.goal);
    return { inS: chainsDiffer(ref, route), ref, route, fields: [f0, f1] };
}
/** Is (x, y) inside the stream's band (reported). */
export const inBand = (st, x, y) => Math.abs(-(x - st.px) * Math.sin(st.theta) + (y - st.py) * Math.cos(st.theta)) < st.halfWidth;

