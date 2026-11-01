// WebGLEngine/brain/subSensedNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SENSED_NAV_WIP.md, the gate is brain/subSensedNav-selfcheck.mjs)
//
// THE SENSED MAP FOR THE SUBMARINE: the harder test's vessel (brain/subHardNav.mjs: the any-angle aim point over a flow field, the margin ladder, the blocked edge band) with the obstacles taken off the chart. It starts with an EMPTY map; a forward-looking SONAR (range 100 m, a 120 degree
// sector ahead of the heading, a ping a second) marks the cells whose centres lie inside an obstacle OCCUPIED as it goes, and the plan is rebuilt after every ping that adds one. Unknown water is planned as FREE (the optimistic choice: a planner that treated it as blocked would not leave the harbour).
// Where the vessel thinks it is is a second thing taken away: `sensed+fix` has an absolute fix each ping with a Gaussian error (sigma FIX_SIGMA), `sensed+drift` has none and dead-reckons with a Wiener drift (DRIFT_SIGMA per root second). The map is registered where the vessel BELIEVES it is, the pilot
// and the physics see the TRUE state, and collisions and arrival are judged on the true position and the true obstacles.
// Three kinds (hard-islands, hard-gaps, hard-current: nothing moves, so no velocity has to be estimated); the sonar is PERFECT inside its sector (no noise, no false returns, no occlusion), which makes every result here a ceiling for a real one.
// Pure: no DOM, no clock, no Math.random (the fix error and the drift are drawn from a stream seeded by the scenario and the arm).
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";

export const SENSE_KINDS = Object.freeze(["hard-islands", "hard-gaps", "hard-current"]);
export const SENSED_ARMS = Object.freeze(["sensed", "sensed+fix", "sensed+drift", "fix+forget", "fix+filter", "fix+forget+filter"]);
export const EXACT_ARM = "any", FLOOR_ARM = "straight";   // flown by subHardNav's flyHard
export const STUDY_ARMS = Object.freeze(["straight", "exact", "sensed", "sensed+fix", "sensed+drift"]), DESIGNATED = "sensed+fix";
export const SONAR = Object.freeze({ range: 100, half: Math.PI / 3, pingS: 1 });
export const FIX_SIGMA = 3, DRIFT_SIGMA = 0.3, FIX_GAIN = 0.2;
// What each sensed arm is (follow-up 2 of brain/SENSED_NAV_WIP.md): `fix` the white error's sigma, `drift` the Wiener sigma, `forget` (a cell in the sector takes what the ping finds, occupied or free), `gain` (K in error = (1 - K) x error + K x fix error; 1 is the white fix) and `stream` (the number that seeds the arm's errors: the arms that
// share a fix share their errors, so a comparison between them is on the SAME errors).
const armSpec = (fix, drift, forget, gain, stream) => Object.freeze({ fix, drift, forget, gain, stream });
export const ARM_SPEC = Object.freeze({ sensed: armSpec(0, 0, false, 1, 1), "sensed+fix": armSpec(FIX_SIGMA, 0, false, 1, 2), "sensed+drift": armSpec(0, DRIFT_SIGMA, false, 1, 3), "fix+forget": armSpec(FIX_SIGMA, 0, true, 1, 2), "fix+filter": armSpec(FIX_SIGMA, 0, false, FIX_GAIN, 2), "fix+forget+filter": armSpec(FIX_SIGMA, 0, true, FIX_GAIN, 2) });
// THE SONARS OF THE GAP STUDY: the incumbent's exact position and sticky memory with another sonar. `sonar-omni` is the omniscient ceiling through the same cell map.
export const SONAR_ARMS = Object.freeze({ "sonar-150": Object.freeze({ range: 150, half: Math.PI / 3, pingS: 1 }), "sonar-200": Object.freeze({ range: 200, half: Math.PI / 3, pingS: 1 }), "sonar-wide": Object.freeze({ range: 100, half: Math.PI / 2, pingS: 1 }), "sonar-200-wide": Object.freeze({ range: 200, half: Math.PI / 2, pingS: 1 }), "sonar-omni": Object.freeze({ range: 1000, half: Math.PI, pingS: 1 }) });
export const GAP_ARMS = Object.freeze(["exact", "sensed", "sonar-150", "sonar-200", "sonar-wide", "sonar-200-wide", "sonar-omni"]), GAP_DESIGNATED = "sonar-200";
export const FIX_ARMS = Object.freeze(["sensed", "sensed+fix", "fix+forget", "fix+filter", "fix+forget+filter", "sensed+drift"]), FIX_DESIGNATED = "fix+forget";
// THE COMBINED STUDY (follow-up 3): the gap study's 200 m sonar with the fix study's cures. A "long+" arm is the sensed arm it maps to, flown with the 200 m sonar (it shares that arm's fix errors, so a comparison is on the same errors).
export const LONG_SONAR = SONAR_ARMS["sonar-200"];
export const LONG_ARMS = Object.freeze({ "long+fix": "sensed+fix", "long+fix+forget": "fix+forget", "long+fix+filter": "fix+filter", "long+fix+forget+filter": "fix+forget+filter", "long+drift": "sensed+drift" });
export const COMBINED_ARMS = Object.freeze(["exact", "sonar-200", "sensed+fix", "fix+forget", "long+fix", "long+fix+forget", "long+fix+filter", "long+fix+forget+filter", "long+drift"]), COMBINED_DESIGNATED = "long+fix+forget";
export const FLY_ARMS = Object.freeze([...STUDY_ARMS, "fix+forget", "fix+filter", "fix+forget+filter", ...Object.keys(SONAR_ARMS), ...Object.keys(LONG_ARMS)]);
export const BARS = Object.freeze({ "hard-islands": 0.8, "hard-gaps": 0.6, "hard-current": 0.7 }), ISLAND_MAX_COLLISIONS = 6;
export const SENSE_SETS = Object.freeze({ dev: N.range(1, 30), held6: N.range(601, 660), held7: N.range(701, 760), held8: N.range(801, 860) });
export const POINT_R = N.CELL / 2;   // an occupied cell is a point 2.5 m wide to the plan; a run of them in a row is the capsule between the end centres

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** A standard normal from a uniform generator (Box-Muller; one draw uses two uniforms, and 1 - u keeps the logarithm finite). */
export const gauss = (u) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const specOf = (arm, who) => { if (!SENSED_ARMS.includes(arm)) throw new Error(`${who}: unknown arm "${arm}" (${SENSED_ARMS.join(", ")})`); return ARM_SPEC[arm]; };

/** An empty map over `grid` ({ x0, y0, w, h }, default the study's region): `seen` (the cell has been ensonified), `occ` (the cell is occupied), and their counts. */
export function createMap(grid = H.DEFAULT_GRID) {
    const n = grid.w * grid.h;
    return { x0: grid.x0, y0: grid.y0, w: grid.w, h: grid.h, cell: N.CELL, seen: new Uint8Array(n), occ: new Uint8Array(n), nSeen: 0, nOcc: 0 };
}
/** The obstacles a plan blocks and a sonar therefore marks: full depth, or a keel (plus VMARGIN) deeper than the shallower of the start and waypoint depths (planShapes' rule). */
export const blockingOf = (obstacles, minDepth) => obstacles.filter((o) => o.keel + H.VMARGIN > minDepth);
/**
 * One ping from the BELIEVED position `pos` ({ x, y }) with the true `heading`: every cell whose centre is within sonar.range of pos and within sonar.half of the heading (both inclusive) is ensonified; one whose centre lies within an obstacle's radius (inclusive) is occupied. `blocking`
 * is the list blockingOf gives, in TRUE coordinates; `off` ({ x, y }) is believed minus true, so the obstacles land in the map's frame where the vessel thinks they are. Returns the number of cells newly occupied. With `forget` a cell in the sector takes the occupancy this ping finds, occupied or
 * free (so an occupied cell can clear), and the return is the number of cells whose occupancy CHANGED.
 */
export function ping(map, blocking, pos, heading, off = { x: 0, y: 0 }, sonar = SONAR, forget = false) {
    const r = Math.ceil(sonar.range / map.cell) + 1, g0 = Math.floor((pos.x - map.x0) / map.cell), h0 = Math.floor((pos.y - map.y0) / map.cell);
    let added = 0;
    for (let gy = Math.max(0, h0 - r); gy <= Math.min(map.h - 1, h0 + r); gy++) for (let gx = Math.max(0, g0 - r); gx <= Math.min(map.w - 1, g0 + r); gx++) {
        const cx = map.x0 + (gx + 0.5) * map.cell, cy = map.y0 + (gy + 0.5) * map.cell, dx = cx - pos.x, dy = cy - pos.y;
        if (Math.hypot(dx, dy) > sonar.range || Math.abs(wrap(Math.atan2(-dy, dx) - heading)) > sonar.half) continue;
        const i = gy * map.w + gx;
        if (!map.seen[i]) { map.seen[i] = 1; map.nSeen++; }
        const inside = (o) => Math.hypot(cx - (o.x + off.x), cy - (o.y + off.y)) <= o.r;
        if (forget) { const now = blocking.some(inside) ? 1 : 0; if (map.occ[i] !== now) { map.occ[i] = now; map.nOcc += now ? 1 : -1; added++; } }
        else if (!map.occ[i] && blocking.some(inside)) { map.occ[i] = 1; map.nOcc++; added++; }
    }
    return added;
}
/** The occupied cells as the plan's shapes: each maximal run of occupied cells along a row is the capsule between the first and last centres, POINT_R wide ({ ax, ay, bx, by, r }, row by row, left to right). */
export function mapShapes(map) {
    const out = [];
    for (let gy = 0; gy < map.h; gy++) for (let gx = 0; gx < map.w; gx++) {
        if (!map.occ[gy * map.w + gx]) continue;
        let e = gx; while (e + 1 < map.w && map.occ[gy * map.w + e + 1]) e++;
        const y = map.y0 + (gy + 0.5) * map.cell;
        out.push({ ax: map.x0 + (gx + 0.5) * map.cell, ay: y, bx: map.x0 + (e + 0.5) * map.cell, by: y, r: POINT_R });
        gx = e;
    }
    return out;
}
/** The plan the map gives (the first margin of the ladder with a route from `from`, subHardNav's buildLadderField) for the waypoint, with the vessel's own surroundings free. */
export const planFromMap = (map, goal, from, { ladder = H.MARGIN_LADDER, own = null } = {}) => H.buildLadderField(mapShapes(map), goal, from, { ladder, own, grid: { x0: map.x0, y0: map.y0, w: map.w, h: map.h } });

const clearAt = (obstacles, x, y, depth) => obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, 0)), Infinity);
let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));

/**
 * Fly one scenario of the static kinds with `pilot` under a sensed arm. Returns { arm, kind, seed, gap, currentMean, blocked, status ("reached" | "collided" | "left" | "timeout" | the vessel's own), reached, t, path, chord, minClearance, ticks, margin (the first plan's), marginLast (the plan in force at the end), noRoute
 * (the first plan: always false on an empty map), plans (builds, the first included), pings, occupied (cells at the end), ensonified (the share of the grid ensonified at least once), offsetEnd (believed minus true, metres, at the end), offsetMax }.
 * A ping every sonar.pingS seconds from t = 0; the plan is built at t = 0 and again after every ping that adds an occupied cell, from the believed position, with the vessel's own 15 m free. `sensed+fix` draws a new error at each ping; `sensed+drift` adds a Wiener step each tick.
 */
export function flySensed(pilot, sc, armName, { seconds = H.SECONDS_HARD, dt = S.DT, model = navModel(), ladder = H.MARGIN_LADDER, sonar = SONAR } = {}) {
    const spec = specOf(armName, "subSensedNav.flySensed"), total = Math.round(seconds / dt), st = sc.start, every = Math.max(1, Math.round(sonar.pingS / dt));
    const rng = mulberry(((sc.seed * 7919 + H.HARD_KINDS.indexOf(sc.kind) * 104729 + 31337) >>> 0) ^ spec.stream * 2654435761), blocking = blockingOf(sc.obstacles, sc.minDepth);
    const map = createMap();
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    let off = { x: 0, y: 0 }, field = null, field0 = null, plans = 0, pings = 0, offMax = 0;
    let status = "timeout", path = 0, minClear = clearAt(sc.obstacles, st.x, st.y, st.depth), ticks = 0, t = null;
    for (let i = 0; i < total; i++) {
        if (i % every === 0) {
            if (spec.fix > 0) { const e = { x: spec.fix * gauss(rng), y: spec.fix * gauss(rng) }, k = i === 0 ? 1 : spec.gain; off = { x: (1 - k) * off.x + k * e.x, y: (1 - k) * off.y + k * e.y }; }
            const bp = { x: s.pos[0] + off.x, y: s.pos[1] + off.y }, added = ping(map, blocking, bp, S.attitude(s).heading, off, sonar, spec.forget); pings++;
            if (i === 0 || added > 0) { field = planFromMap(map, sc.goal, bp, { ladder, own: i === 0 ? null : bp }); plans++; if (!field0) field0 = field; }
        }
        const bs = { ...s, pos: [s.pos[0] + off.x, s.pos[1] + off.y, s.pos[2]] }, target = H.hardTarget("any", bs, field, sc.goal), cv = ST.currentAt(sc.current, i * dt), cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError);
        const px = s.pos[0], py = s.pos[1];
        s = res.state; ticks++;
        if (spec.drift > 0) { const k = spec.drift * Math.sqrt(dt); off = { x: off.x + k * gauss(rng), y: off.y + k * gauss(rng) }; }
        offMax = Math.max(offMax, Math.hypot(off.x, off.y));
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        const clear = clearAt(sc.obstacles, x, y, -s.pos[2]);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = now; break; }
    }
    const f0 = N.cellOf(field0, st.x, st.y);
    return { arm: armName, kind: sc.kind, seed: sc.seed, gap: sc.gapWidth, currentMean: sc.currentMean, blocked: sc.blocked, status, reached: status === "reached", t, path, chord: Math.hypot(sc.goal.x - st.x, sc.goal.y - st.y), minClearance: minClear, ticks,
        margin: field0.margin, marginLast: field.margin, noRoute: !(f0 && field0.dist[f0.i] < N.BIG), plans, pings, occupied: map.nOcc, ensonified: map.nSeen / (map.w * map.h), offsetEnd: Math.hypot(off.x, off.y), offsetMax: offMax };
}
/** The flight for any arm the studies use: `straight` and `exact` by subHardNav's flyHard, the sensed arms (SENSED_ARMS) by flySensed, a sonar arm (SONAR_ARMS) by flySensed under `sensed` with that sonar, and a long arm (LONG_ARMS) by flySensed under the sensed arm it maps to with the 200 m sonar (the record carries the arm's own name). */
export function flyArm(pilot, sc, arm, opts = {}) {
    if (!FLY_ARMS.includes(arm)) throw new Error(`subSensedNav.flyArm: unknown arm "${arm}" (${FLY_ARMS.join(", ")})`);
    if (arm === "straight") return H.flyHard(pilot, sc, FLOOR_ARM, opts);
    if (arm === "exact") return { ...H.flyHard(pilot, sc, EXACT_ARM, opts), arm: "exact" };
    if (LONG_ARMS[arm]) return { ...flySensed(pilot, sc, LONG_ARMS[arm], { ...opts, sonar: LONG_SONAR }), arm };
    return SONAR_ARMS[arm] ? { ...flySensed(pilot, sc, "sensed", { ...opts, sonar: SONAR_ARMS[arm] }), arm } : flySensed(pilot, sc, arm, opts);
}
/** The scenarios of a set: its seeds of each of the three kinds (SENSE_KINDS order), frozen. */
export const senseSetOf = (name) => { if (!SENSE_SETS[name]) throw new Error(`subSensedNav.senseSetOf: unknown set "${name}" (${Object.keys(SENSE_SETS).join(", ")})`); return Object.freeze(SENSE_KINDS.flatMap((k) => SENSE_SETS[name].map((s) => H.hardScenario(s, k)))); };
