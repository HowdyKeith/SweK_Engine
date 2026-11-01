// WebGLEngine/brain/subTankNav.mjs -- UNNUMBERED (the version is chosen at ship time; the design is "FOLLOW-UP 4" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subTankNav-selfcheck.mjs)
//
// NAVIGATION IN THE SUB AQUARIUM'S TANK, WITHOUT A PICTURE: a seeded SEA of obstacles for the standard 500 x 300 m tank (two islands of overlapping discs, three icebergs with a keel, two ships that patrol a straight lane and turn round at its ends) and a NAVIGATOR that
// gives one sub a goal and the heading to it, using the plan of brain/subHardNav.mjs -- the code the harder navigation test (HELD4) was flown on, with its `grid` and obstacle-position options. THE NAVIGATOR ONLY REPLACES THE SUB'S WANDERING TARGET: the sub's own pilot (the PD autopilot, the
// network, the stateful fly pilot) still flies it, as in the studies. Contact with an obstacle is COUNTED (a new contact only after HIT_CLEAR_S seconds clear), not punished: an aquarium.
// Arms: straight, any (the plan made when the goal is drawn), any+replan, any+predict (the default; every HELD4 name, one code path). Unlike the study a plan here ALWAYS keeps the vessel's own 15 m free (a sub that starts a goal inside a zone still has a way out).
// Pure: no DOM, no clock (the caller says what time it is and how long the tick was), no Math.random.
"use strict";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";

export const TANK_LENGTH = 500, TANK_WIDTH = 300, TANK_GRID = Object.freeze({ x0: 0, y0: 0, w: 100, h: 60 });
export const TANK_ARMS = Object.freeze(["straight", "any", "any+replan", "any+predict"]), DEFAULT_ARM = "any+predict";
export const DEPTH_MIN = 14, DEPTH_MAX = 40;   // the tank's own wandering range (render/subAquariumSim.mjs); the gate holds the two together
export const SCENE = Object.freeze({ islands: 2, bergs: 3, ships: 2, wallClear: 30, gap: 24, laneClear: 10 });
// a goal is r + GOAL_CLEAR m from every static disc and every lane: 28 = the plan's 16 m at the widest margin + 12 m, so the goal cell is free and the 10 m arrival circle stays out of the zone (the study kept r + 40, which in a 500 x 300 m tank with seven obstacles leaves
// almost nothing: the first draft did and fell back to its default corner in 18 of 25 draws)
export const GOAL_MARGIN = 60, GOAL_MIN_DIST = 150, GOAL_CLEAR = 28, GOAL_TRIES = 200, GOAL_DEPTH_INSET = 2, HIT_CLEAR_S = 1;

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A coordinate folded back into [lo, hi] as a ball bouncing between two walls (a triangle wave of period 2 (hi - lo)). */
export function reflect(c, lo, hi) {
    const span = hi - lo, p = (((c - lo) % (2 * span)) + 2 * span) % (2 * span);
    return lo + (p <= span ? p : 2 * span - p);
}
/** An obstacle's centre at tank time t: a static one stays; a ship is at lane.c0 + lane.v t along its lane, folded back at the ends. */
export function sceneAt(o, t) {
    if (!o.lane) return [o.x, o.y];
    const L = o.lane, c = reflect(L.c0 + L.v * t, L.lo, L.hi);
    return L.axis === "x" ? [c, L.fixed] : [L.fixed, c];
}
/** The lane of a ship as a segment [x0, y0, x1, y1]. */
export const laneSegment = (o) => (o.lane.axis === "x" ? [o.lane.lo, o.lane.fixed, o.lane.hi, o.lane.fixed] : [o.lane.fixed, o.lane.lo, o.lane.fixed, o.lane.hi]);

/**
 * A sea for the standard tank: { seed, length, width, obstacles [{ type ("island" | "berg" | "ship"), group, x, y, r, keel (Infinity: full depth), vx: 0, vy: 0, lane (ships: { axis, fixed, lo, hi, c0, v }) }] }.
 * Two islands (a main disc of radius 14 to 22 and one or two satellites of 8 to 14 overlapping it), three icebergs (radius 12 to 22, keel 15 to 35 m) and two ships (radius 8 to 12, keel 18 to 40 m, 1.0 to 2.5 m/s on a lane 150 to 280 m long).
 * Every disc is 30 m inside the walls and 24 m of water from every disc of another group; a ship's lane keeps r + r' + 10 m from every static disc. A tank of another size throws.
 */
export function tankScene(seed, { length = TANK_LENGTH, width = TANK_WIDTH } = {}) {
    if (length !== TANK_LENGTH || width !== TANK_WIDTH) throw new Error(`subTankNav.tankScene: the navigation scene is for the standard ${TANK_LENGTH} x ${TANK_WIDTH} m tank (got ${length} x ${width}): a larger tank's plan costs 4 to 36 times more to rebuild`);
    const r = mulberry((seed * 7919 + 13) >>> 0), u = (lo, hi) => lo + (hi - lo) * r(), placed = [];
    const fits = (d) => d.x - d.r >= SCENE.wallClear && d.x + d.r <= length - SCENE.wallClear && d.y - d.r >= SCENE.wallClear && d.y + d.r <= width - SCENE.wallClear && placed.every((p) => Math.hypot(d.x - p.x, d.y - p.y) >= d.r + p.r + SCENE.gap);
    let g = 0;
    for (let tries = 0; tries < 3000 && g < SCENE.islands; tries++) {
        const r1 = u(14, 22), main = { x: u(60, length - 60), y: u(60, width - 60), r: r1 }, members = [main], nSat = 1 + Math.floor(r() * 2);
        for (let k = 0; k < nSat; k++) { const r2 = u(8, 14), ang = u(0, 2 * Math.PI), dist = (r1 + r2) * u(0.6, 0.9); members.push({ x: main.x + dist * Math.cos(ang), y: main.y + dist * Math.sin(ang), r: r2 }); }
        if (members.every(fits)) { for (const d of members) placed.push({ ...d, group: g, type: "island", keel: Infinity }); g++; }
    }
    for (let tries = 0, b = 0; tries < 3000 && b < SCENE.bergs; tries++) {
        const d = { x: u(60, length - 60), y: u(60, width - 60), r: u(12, 22) }, keel = u(15, 35);
        if (fits(d)) { placed.push({ ...d, group: 1000 + b, type: "berg", keel }); b++; }
    }
    const obstacles = placed.map((p) => ({ type: p.type, group: p.group, x: p.x, y: p.y, r: p.r, keel: p.keel, vx: 0, vy: 0 }));
    for (let tries = 0, made = 0; tries < 400 && made < SCENE.ships; tries++) {
        const axis = r() < 0.5 ? "x" : "y", extent = axis === "x" ? length : width, across = axis === "x" ? width : length, rad = u(8, 12), v = u(1.0, 2.5) * (r() < 0.5 ? 1 : -1), keel = u(18, 40);
        const lo = u(60, extent - 60 - 150), hi = Math.min(extent - 60, lo + u(150, 280)), fixed = u(60, across - 60), c0 = u(lo, hi), lane = { axis, fixed, lo, hi, c0, v };
        const seg = axis === "x" ? [lo, fixed, hi, fixed] : [fixed, lo, fixed, hi];
        if (obstacles.some((o) => o.vx === 0 && !o.lane && N.segmentDistance(o.x, o.y, seg[0], seg[1], seg[2], seg[3]) < rad + o.r + SCENE.laneClear)) continue;
        const [x, y] = sceneAt({ lane }, 0);
        obstacles.push({ type: "ship", group: 2000 + made, x, y, r: rad, keel, vx: 0, vy: 0, lane }); made++;
    }
    return Object.freeze({ seed, length, width, obstacles: Object.freeze(obstacles.map((o) => Object.freeze(o.lane ? { ...o, lane: Object.freeze(o.lane) } : o))) });
}
/** The sea as it is at tank time t: [{ type, group, x, y, r, keel }] (what a page draws). */
export const sceneNow = (scene, t) => scene.obstacles.map((o) => { const [x, y] = sceneAt(o, t); return { type: o.type, group: o.group, x, y, r: o.r, keel: o.keel }; });

/**
 * A navigator for ONE sub in a scene. `step(state, t, dt)` -- the sub's state, the tank's clock and the tick -- keeps the counters, draws a goal when there is none or it has been reached, (re)plans when the arm says, and returns the target
 * { depth, heading, speed } for the sub's own pilot. `snapshot()` is { arm, goal { x, y, depth }, arrivals, hits, replans, noRoute, margin (the plan's), travel (metres on the plane), contact }; `invalidate()` drops the plan (a sub put back after a loss).
 */
export function createNavigator(scene, { arm = DEFAULT_ARM, seed = 1 } = {}) {
    if (!TANK_ARMS.includes(arm)) throw new Error(`subTankNav.createNavigator: unknown arm "${arm}" (${TANK_ARMS.join(", ")})`);
    const rng = mulberry(((seed >>> 0) + 977) >>> 0), u = (lo, hi) => lo + (hi - lo) * rng(), spec = H.ARM_SPEC[arm], mode = spec.replan === "predict" ? "predict" : "now";
    let goal = null, field = null, planT = -Infinity, clearFor = 0, last = null, arrivals = 0, hits = 0, replans = 0, noRoute = false, margin = null, travel = 0, contact = false;
    const clearOf = (o, g) => (o.lane ? N.segmentDistance(g.x, g.y, ...laneSegment(o)) : Math.hypot(g.x - o.x, g.y - o.y)) >= o.r + GOAL_CLEAR;
    const routeFrom = (g, state, t) => {
        const f = H.buildLadderField(H.planShapes({ obstacles: scene.obstacles, minDepth: Math.min(-state.pos[2], g.depth) }, t, { mode: "now", at: sceneAt }), g, { x: state.pos[0], y: state.pos[1] }, { grid: TANK_GRID }), c = N.cellOf(f, state.pos[0], state.pos[1]);
        return !!c && f.dist[c.i] < N.BIG;
    };
    function drawGoal(state, t) {
        let pick = null;
        for (let i = 0; i < GOAL_TRIES; i++) {
            const g = { x: u(GOAL_MARGIN, scene.length - GOAL_MARGIN), y: u(GOAL_MARGIN, scene.width - GOAL_MARGIN), depth: u(DEPTH_MIN + GOAL_DEPTH_INSET, DEPTH_MAX - GOAL_DEPTH_INSET) };
            if (Math.hypot(g.x - state.pos[0], g.y - state.pos[1]) < GOAL_MIN_DIST || !scene.obstacles.every((o) => clearOf(o, g))) continue;
            pick = g;
            if (arm === "straight" || routeFrom(g, state, t)) break;
        }
        goal = pick || { x: scene.length - GOAL_MARGIN, y: scene.width / 2, depth: (DEPTH_MIN + DEPTH_MAX) / 2 };
        field = null;
    }
    function plan(state, t) {
        const at = { x: state.pos[0], y: state.pos[1] };
        field = H.buildLadderField(H.planShapes({ obstacles: scene.obstacles, minDepth: Math.min(-state.pos[2], goal.depth) }, t, { mode, at: sceneAt }), goal, at, { own: at, grid: TANK_GRID });
        planT = t; replans++; margin = field.margin;
        const c = N.cellOf(field, at.x, at.y); noRoute = !(c && field.dist[c.i] < N.BIG);
    }
    return {
        arm,
        invalidate() { field = null; },
        step(state, t, dt) {
            const x = state.pos[0], y = state.pos[1], depth = -state.pos[2];
            if (last) travel += Math.hypot(x - last[0], y - last[1]);
            last = [x, y];
            if (!goal) drawGoal(state, t);
            const gap = scene.obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, t, sceneAt)), Infinity);
            if (gap < 0) { if (!contact) { hits++; contact = true; } clearFor = 0; } else if (contact) { clearFor += dt; if (clearFor >= HIT_CLEAR_S) contact = false; }
            if (MT.reached(state, goal)) { arrivals++; drawGoal(state, t); }
            if (spec.field && (field === null || (spec.replan !== "none" && t - planT >= H.REPLAN_S))) plan(state, t);
            if (x < 0 || x > scene.length || y < 0 || y > scene.width) return { depth: goal.depth, heading: Math.atan2(-(scene.width / 2 - y), scene.length / 2 - x), speed: 2 };   // outside the tank: back to the middle, as a wanderer does
            return H.hardTarget(arm, state, field, goal);
        },
        snapshot() { return { arm, goal: goal ? { ...goal } : null, arrivals, hits, replans, noRoute, margin, travel, contact }; },
    };
}
