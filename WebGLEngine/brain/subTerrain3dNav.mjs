// WebGLEngine/brain/subTerrain3dNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 11" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subTerrain3dNav-selfcheck.mjs)
//
// A DEPTH DIMENSION FOR THE NAVIGATION TEST. hard-islands scenarios (brain/subHardNav.mjs) get a SEABED (brain/missionTask.mjs's seabedAt form) and the vessel can GROUND. Three arms on the HELD4 `any` plan: `any` (blind to the floor), `any+floor` (the depth target held ALTITUDE above the floor under the hull and 20 m ahead)
// and `any+3d` (the floor clamp plus a vertical plan: a berg the vessel can dive under with the floor ALTITUDE below it is removed from the plan and the depth target is held under its keel while the vessel is near or heading at it). subHardNav and missionTask are CALLED, not edited.
// OPTIMISTIC, said plainly: the floor is read EXACTLY (no sonar noise), the seabed is smooth sinusoids, the vertical plan is a depth floor under a berg and not a 3D path search.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";

export const TERRAIN_ARMS = Object.freeze(["any", "any+floor", "any+3d"]), REFERENCE = "any+floor", DESIGNATED = "any+3d", KIND = "hard-islands";
export const ALTITUDE = MT.ALTITUDE, DIVE_PAD = 20, DIVE_LOOK_M = 90, SONAR_AHEAD = MT.SONAR_RANGE;
export const TERRAIN = Object.freeze({ baseLo: 65, baseHi: 85, a1Lo: 3, a1Hi: 8, l1Lo: 100, l1Hi: 160, a2Lo: 1, a2Hi: 4, l2Lo: 50, l2Hi: 80, bLo: 2, bHi: 6, lyLo: 120, lyHi: 200 });
export const HELD11 = Object.freeze(N.range(1101, 1160)), SETS = Object.freeze({ dev: H.HARD_SETS.dev, held11: HELD11 });
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));

/** The seabed for a seed: a terrain { base, a1, l1, p1, a2, l2, p2, b, ly, py } in missionTask.seabedAt's form, ranges in TERRAIN, from a seeded generator (not the scenario's). */
export function terrainFor(seed) {
    const r = mulberry((seed * 2654435761 + 9013) >>> 0), u = (lo, hi) => lo + (hi - lo) * r(), T = TERRAIN;
    return Object.freeze({ base: u(T.baseLo, T.baseHi), a1: u(T.a1Lo, T.a1Hi), l1: u(T.l1Lo, T.l1Hi), p1: u(0, 6.28), a2: u(T.a2Lo, T.a2Hi), l2: u(T.l2Lo, T.l2Hi), p2: u(0, 6.28), b: u(T.bLo, T.bHi), ly: u(T.lyLo, T.lyHi), py: u(0, 6.28) });
}
/** The depth the vessel's centre must be at or below to pass under a keel: keel + VMARGIN + VRADIUS. */
export const keelNeed = (o) => o.keel + H.VMARGIN + H.VRADIUS;
/** The floor at nine points of a disc's footprint: the centre and eight on its circle; the least of them. */
export function footprintFloor(terrain, o) {
    let m = MT.seabedAt(terrain, o.x, o.y);
    for (let k = 0; k < 8; k++) m = Math.min(m, MT.seabedAt(terrain, o.x + o.r * Math.cos(k * Math.PI / 4), o.y + o.r * Math.sin(k * Math.PI / 4)));
    return m;
}
/** Can the vessel dive under this obstacle: a berg (finite keel) with the floor ALTITUDE below the keel clearance at every footprint point? */
export const passableUnder = (terrain, o) => o.type === "berg" && Number.isFinite(o.keel) && footprintFloor(terrain, o) - ALTITUDE >= keelNeed(o);
/** Is the vessel at (x, y) heading h near the obstacle's footprint grown by DIVE_PAD, or heading at it within DIVE_LOOK_M? */
export function nearOrAhead(x, y, h, o) {
    const grown = o.r + DIVE_PAD, dx = o.x - x, dy = o.y - y;
    if (Math.hypot(dx, dy) <= grown) return true;
    const ux = Math.cos(h), uy = -Math.sin(h), along = dx * ux + dy * uy;
    return along >= 0 && along <= DIVE_LOOK_M && Math.abs(dx * uy - dy * ux) <= grown;
}
/** The depth target of an arm at a state: { depth, held } -- the waypoint's depth, raised for the passable bergs `3d` dives under (held true when a keel raised it), then clamped to the floor (ALTITUDE above the floor under the hull and SONAR_AHEAD ahead) for the floor arms. */
export function depthTarget(armName, terrain, obstacles, x, y, h, wantDepth) {
    let depth = wantDepth, held = false;
    if (armName === "any+3d") for (const o of obstacles) if (passableUnder(terrain, o) && nearOrAhead(x, y, h, o)) { const need = keelNeed(o); if (need > depth) { depth = need; held = true; } }
    if (armName !== "any") depth = Math.min(depth, Math.min(MT.seabedAt(terrain, x, y), MT.seabedAt(terrain, x + SONAR_AHEAD * Math.cos(h), y - SONAR_AHEAD * Math.sin(h))) - ALTITUDE);
    return { depth, held };
}

/** Fly one hard-islands seed (over `terrain` when given, else terrainFor(seed): the gate gives a shallow one to reach the grounding) under an arm of TERRAIN_ARMS; the flyHard record plus { arm, grounded (bool), minFloor (least hull-to-floor gap, m), dives (ticks held down by a keel), passable (bergs passable under in this scenario), terrain }. */
export function flyTerrain(pilot, seed, armName, { seconds = H.SECONDS_HARD, dt = S.DT, model = navModel(), ladder = H.MARGIN_LADDER, terrain: terrainOverride = null } = {}) {
    if (!TERRAIN_ARMS.includes(armName)) throw new Error(`subTerrain3dNav.flyTerrain: unknown arm "${armName}" (${TERRAIN_ARMS.join(", ")})`);
    const sc = H.hardScenario(seed, KIND), terrain = terrainOverride || terrainFor(seed), st = sc.start, total = Math.round(seconds / dt), R = model.spec.radius, L = model.spec.length;
    const passable = sc.obstacles.filter((o) => passableUnder(terrain, o)), planSc = armName === "any+3d" ? Object.freeze({ ...sc, obstacles: Object.freeze(sc.obstacles.filter((o) => !passable.includes(o))) }) : sc;
    const field = H.buildLadderField(H.planShapes(planSc, 0, { mode: "now" }), sc.goal, st, { ladder }), sc0 = N.cellOf(field, st.x, st.y), noRoute = !(sc0 && field.dist[sc0.i] < N.BIG);
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    const clearAt = (x, y, depth, tt) => sc.obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, tt)), Infinity);
    let status = "timeout", path = 0, minClear = clearAt(st.x, st.y, st.depth, 0), minFloor = Infinity, ticks = 0, t = null, hit = null, dives = 0;
    for (let i = 0; i < total; i++) {
        let target = H.hardTarget("any", s, field, sc.goal, null);
        const a0 = S.attitude(s), dt3 = depthTarget(armName, terrain, sc.obstacles, s.pos[0], s.pos[1], a0.heading, target.depth);
        if (dt3.held) dives++;
        target = { ...target, depth: dt3.depth };
        const cv = ST.currentAt(sc.current, i * dt), cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError), px = s.pos[0], py = s.pos[1];
        s = res.state; ticks++;
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt, a = S.attitude(s), floorGap = MT.seabedAt(terrain, x, y) - a.depth - (R * Math.cos(a.pitch) + 0.5 * L * Math.abs(Math.sin(a.pitch)));
        path += Math.hypot(x - px, y - py);
        if (floorGap < minFloor) minFloor = floorGap;
        if (floorGap <= 0) { status = "grounded"; break; }
        const clear = clearAt(x, y, a.depth, now);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; hit = (sc.obstacles.find((o) => H.gapTo(o, x, y, a.depth, now) < 0) || {}).type || null; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = now; break; }
    }
    return { arm: armName, kind: KIND, seed, status, hit, reached: status === "reached", grounded: status === "grounded", t, path, chord: Math.hypot(sc.goal.x - st.x, sc.goal.y - st.y), minClearance: minClear, minFloor: Number.isFinite(minFloor) ? minFloor : null, dives, passable: passable.length, ticks, noRoute };
}
