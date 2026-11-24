// WebGLEngine/brain/subNav3d.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/NAV_3D_WIP.md, the command tools/ship/subNav3dStudy.mjs, the gate brain/subNav3d-selfcheck.mjs)
//
// NAVIGATION WITH A DEPTH DIMENSION (`nav-3d-terrain` of brain/BACKLOG_2026-11-01.md): WALLS across the whole width of the region that the vessel must pass BENEATH (a curtain of icebergs: `depth >= keel + VMARGIN + VRADIUS`) or OVER (a ridge of the seabed: `depth <= crest - VMARGIN - VRADIUS`),
// in three kinds -- keel-wall, ridge, both (a keel wall and then a ridge) -- on top of the harder test's islands (brain/subHardNav.mjs, not edited) and flown with brain/subNavPlus.mjs's flyPlus through two options it gained for this (`depthOf`, a depth schedule; `groundAt`, a seabed that rises).
// Two arms with the same any-angle plan and autopilot: `any` (the incumbent: the waypoint's depth, the plan told of the icebergs by the keel rule so a keel wall blocks it, no knowledge of the seabed) and `any+vertical` (a DEPTH SCHEDULE: the plan is made at the depth the keel walls need so they do not block it, and the depth
// asked for is, ahead of each wall, the depth inside the wall's window nearest the waypoint's, reached in time for the wall -- the transition starts |change| / VZ x speed + PREVIEW_EXTRA m before the wall -- and the waypoint's depth again after the last wall).
// OPTIMISTIC, said plainly: the keels and the seabed are known exactly, the walls span the region, there is no current and no traffic, and the schedule is computed once. Pure: no DOM, no clock, no Math.random (a scenario is a function of its seed and kind).
"use strict";
import * as H from "./subHardNav.mjs";
import * as N from "./subFieldNav.mjs";
import * as P from "./subNavPlus.mjs";

export const KINDS3D = Object.freeze(["keel-wall", "ridge", "both"]);
export const ARMS3D = Object.freeze(["any", "any+vertical"]);
export const SETS3D = Object.freeze({ dev: N.range(1, 12), held77: N.range(9001, 9040) });
export const KEEL_RANGE = Object.freeze([32, 44]), CREST_RANGE = Object.freeze([18, 30]), DEPTH_RANGE = Object.freeze([18, 28]);
export const BERG_R = 14, BERG_STEP = 20, RIDGE_HALF = 20, KEEL_X = Object.freeze([120, 140]), SINGLE_X = Object.freeze([150, 250]), RIDGE_AFTER = 164, RIDGE_SLACK = 35;
export const MAX_DEPTH = 90, MIN_DEPTH = 12, VZ = 1.0, PREVIEW_EXTRA = 25;   // the deepest the vessel is asked to go (the crush depth is 100), the shallowest, the autopilot's climb rate (m/s) and the metres added to the preview of a wall
export const WINDOW_MARGIN = H.VMARGIN + H.VRADIUS;   // 5.6 m: the plan's margin of 5 and the vessel's half height
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/**
 * A scenario: the harder test's islands (its generator's start, goal, islands and nothing else) with the start and goal depths drawn from DEPTH_RANGE and the walls of the kind: `walls` [{ type ("keel" | "ridge"), x0, x1, keel | crest }] (a keel wall is also in `obstacles` as a curtain of
 * icebergs from edge to edge, so the flight's collision test and the incumbent's plan see it; a ridge is in `walls` only: the seabed is not an obstacle of the plan). A function of the seed and the kind.
 */
export function scenario3d(seed, kind) {
    if (!KINDS3D.includes(kind)) throw new Error(`subNav3d.scenario3d: unknown kind "${kind}" (${KINDS3D.join(", ")})`);
    const base = H.hardScenario(seed, "hard-islands"), r = mulberry((seed * 7919 + KINDS3D.indexOf(kind) * 104729 + 9109) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const start = { ...base.start, depth: u(DEPTH_RANGE[0], DEPTH_RANGE[1]) }, goal = { ...base.goal, depth: u(DEPTH_RANGE[0], DEPTH_RANGE[1]) }, minDepth = Math.min(start.depth, goal.depth);
    const walls = [], obstacles = base.obstacles.filter((o) => o.type === "island").map((o) => ({ ...o }));
    const keelWall = (xc, keel, g) => { walls.push({ type: "keel", x0: xc - BERG_R, x1: xc + BERG_R, keel }); for (let y = N.REGION.y0 + 8; y <= N.REGION.y1 - 8; y += BERG_STEP) obstacles.push({ type: "berg", group: g, x: xc, y, r: BERG_R, keel, vx: 0, vy: 0 }); };
    const ridge = (xc, crest) => walls.push({ type: "ridge", x0: xc - RIDGE_HALF, x1: xc + RIDGE_HALF, crest });
    if (kind === "keel-wall") keelWall(u(SINGLE_X[0], SINGLE_X[1]), u(KEEL_RANGE[0], KEEL_RANGE[1]), 3000);
    else if (kind === "ridge") ridge(u(SINGLE_X[0], SINGLE_X[1]), u(CREST_RANGE[0], CREST_RANGE[1]));
    else { const kx = u(KEEL_X[0], KEEL_X[1]); keelWall(kx, u(KEEL_RANGE[0], KEEL_RANGE[1]), 3000); ridge(kx + RIDGE_AFTER + u(0, RIDGE_SLACK), u(CREST_RANGE[0], CREST_RANGE[1])); }
    // an island must not stand in a wall's x-range (the schedule is told nothing of the plan view): islands inside a wall's range or within BERG_R + 24 m of it are dropped
    const kept = obstacles.filter((o) => o.type !== "island" || walls.every((w) => o.x + o.r + 24 < w.x0 || o.x - o.r - 24 > w.x1));
    return Object.freeze({ ...base, seed, kind, start: Object.freeze(start), goal: Object.freeze(goal), minDepth, obstacles: Object.freeze(kept.map((o) => Object.freeze(o))), walls: Object.freeze(walls.map((w) => Object.freeze(w))), blocked: false });
}

/** The depth window a wall puts on the vessel while it is inside the wall's x-range: { lo, hi } in metres of depth (a keel wall: at least keel + WINDOW_MARGIN, at most MAX_DEPTH; a ridge: at least MIN_DEPTH, at most crest - WINDOW_MARGIN). */
export const windowOf = (w) => (w.type === "keel" ? { lo: w.keel + WINDOW_MARGIN, hi: MAX_DEPTH } : { lo: MIN_DEPTH, hi: w.crest - WINDOW_MARGIN });
/** The depth the schedule asks for at a wall: the depth inside its window nearest the waypoint's. */
export const requiredAt = (w, goalDepth) => { const { lo, hi } = windowOf(w); return Math.max(lo, Math.min(hi, goalDepth)); };

/**
 * The depth schedule of a scenario: depthOf(state) -> the depth to ask for. The first wall whose far edge is still ahead of the vessel is the one in view; when the vessel is inside the preview of it (|required - depth| / VZ x ground speed + PREVIEW_EXTRA m before its near edge)
 * or inside it, the required depth is asked for; otherwise, and after the last wall, the waypoint's.
 */
export function depthSchedule(sc) {
    const walls = [...sc.walls].sort((a, b) => a.x0 - b.x0);
    return (s) => {
        const x = s.pos[0], d = -s.pos[2], v = Math.max(1, Math.hypot(s.vel[0], s.vel[1])), w = walls.find((q) => q.x1 >= x);
        if (!w) return sc.goal.depth;
        const req = requiredAt(w, sc.goal.depth), pre = Math.abs(req - d) / VZ * v + PREVIEW_EXTRA;
        return x >= w.x0 - pre ? req : sc.goal.depth;
    };
}
/** Is the hull's bottom on a ridge at (x, y, depth)? (depth + the half height reaches a crest while the vessel is inside the ridge's x-range.) */
export const groundedAt = (sc) => (x, y, depth) => sc.walls.some((w) => w.type === "ridge" && x >= w.x0 && x <= w.x1 && depth + H.VRADIUS >= w.crest);
/** The depth the plan is made at for `any+vertical`: the deepest the keel walls need (so no keel wall blocks it), never shallower than the scenario's own. */
export const planDepth = (sc) => sc.walls.reduce((m, w) => (w.type === "keel" ? Math.max(m, windowOf(w).lo) : m), sc.minDepth);

/** Fly one arm of ARMS3D over a scenario (flyPlus's result with `arm` and `walls` named). `any`: the waypoint's depth, the plan at the scenario's minimum depth. `any+vertical`: the schedule, the plan at planDepth. */
export function fly3d(pilot, sc, arm, opts = {}) {
    if (!ARMS3D.includes(arm)) throw new Error(`subNav3d.fly3d: unknown arm "${arm}" (${ARMS3D.join(", ")})`);
    const groundAt = groundedAt(sc);
    const r = arm === "any" ? P.flyPlus(pilot, sc, "any", { ...opts, groundAt }) : P.flyPlus(pilot, { ...sc, minDepth: planDepth(sc) }, "any", { ...opts, groundAt, depthOf: depthSchedule(sc) });
    return { ...r, arm, kind: sc.kind, walls: sc.walls.length };
}
/** Every scenario's two arms, scenario-major. */
export function evaluate3d(pilot, scenarios, opts = {}) { const out = []; for (const sc of scenarios) for (const arm of ARMS3D) out.push(fly3d(pilot, sc, arm, opts)); return out; }
