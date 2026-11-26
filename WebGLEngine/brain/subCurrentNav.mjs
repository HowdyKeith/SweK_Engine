// WebGLEngine/brain/subCurrentNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 7" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subCurrentNav-selfcheck.mjs)
//
// THE CURRENT IN THE FIELD, two of the entry's four parts: (1) a CRAB ANGLE in the aim point -- the nose is pointed so that the water velocity plus the (known, mean) current lies along the ground course the field asks for; (2) a MARGIN THAT GROWS WITH THE CURRENT -- every rung of the
// ladder raised by the distance the current carries the vessel in a quarter turn. The current in the COST and the turn radius in the margin as a separate term are NOT here (the field solver is not edited). brain/subHardNav.mjs supplies the scenario, the plan, the field and the vessel, CALLED not copied.
// OPTIMISTIC, said plainly: the planner is told the mean current exactly and nothing of the unsteady part or the weight error; the map and the fix are exact.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";

export const CURRENT_ARMS = Object.freeze(["any", "any+crab", "any+margin", "any+crab+margin"]), DESIGNATED = "any+crab+margin", REFERENCE = "any";
export const STRENGTHS = Object.freeze({ "x1.0": 1.0, "x1.5": 1.5 });
export const CRUISE = N.CRUISE, R_TURN = 35, T_TURN = (Math.PI / 2) * R_TURN / CRUISE, CRAB_MAX = 0.9;
export const HELD7 = Object.freeze(N.range(701, 760)), SETS = Object.freeze({ dev: H.HARD_SETS.dev, held7: HELD7 });
const SPEC = Object.freeze({ any: { crab: false, margin: false }, "any+crab": { crab: true, margin: false }, "any+margin": { crab: false, margin: true }, "any+crab+margin": { crab: true, margin: true } });
const specOf = (a, who) => { if (!SPEC[a]) throw new Error(`${who}: unknown arm "${a}" (${CURRENT_ARMS.join(", ")})`); return SPEC[a]; };
let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));

/** The scenario at a strength: hard-current with the current's mean and unsteady amplitude multiplied by `k` (1: unchanged); currentMean follows. */
export function currentScenario(seed, strength) {
    if (!(strength in STRENGTHS)) throw new Error(`subCurrentNav.currentScenario: unknown strength "${strength}" (${Object.keys(STRENGTHS).join(", ")})`);
    const sc = H.hardScenario(seed, "hard-current"), k = STRENGTHS[strength];
    if (k === 1) return sc;
    const c = sc.current;
    return Object.freeze({ ...sc, currentMean: sc.currentMean * k, current: Object.freeze({ ...c, mean: c.mean.map((m) => m * k), amp: c.amp.map((a) => a * k) }) });
}
/** The horizontal mean current the planner is told: [cx, cy]. */
export const meanOf = (sc) => [sc.current.mean[0], sc.current.mean[1]];
/** The raised ladder for a mean current c: each rung of the ordinary ladder plus |c| x T_TURN, then the ordinary rungs. A still sea gives the ordinary ladder twice, in order. */
export const driftMargin = (c) => Math.hypot(c[0], c[1]) * T_TURN;
export const raisedLadder = (c, ladder = H.MARGIN_LADDER) => Object.freeze([...ladder.map((m) => m + driftMargin(c)), ...ladder]);
/**
 * The nose heading for ground course `h` (the plan's convention: velocity = (cos h, -sin h)) in the mean current c at water speed V: u.n = -(c.n)/V, clamped to +-CRAB_MAX, u = sqrt(1-k^2) g + k n with n = g turned 90 degrees (+). Returns the heading of u.
 */
export function crabHeading(h, c, V = CRUISE) {
    const gx = Math.cos(h), gy = -Math.sin(h), nx = -gy, ny = gx;
    let k = -(c[0] * nx + c[1] * ny) / V;
    k = Math.max(-CRAB_MAX, Math.min(CRAB_MAX, k));
    const w = Math.sqrt(1 - k * k), ux = w * gx + k * nx, uy = w * gy + k * ny;
    return Math.atan2(-uy, ux);
}

/**
 * Fly one hard-current scenario (at a strength) under `arm`; the record of flyHard plus { strength, crab, margin0 }. The plan is built once at t = 0 (the ladder raised by the mean current for the margin arms); the crab arms replace the field's heading by crabHeading
 * at the current mean, every tick. status: "reached" | "collided" | "left" | "timeout" | the vessel's own.
 */
export function flyCurrent(pilot, seed, strength, armName, { seconds = H.SECONDS_HARD, dt = S.DT, model = navModel() } = {}) {
    const spec = specOf(armName, "subCurrentNav.flyCurrent"), sc = currentScenario(seed, strength), c = meanOf(sc), st = sc.start, total = Math.round(seconds / dt);
    const ladder = spec.margin ? raisedLadder(c) : H.MARGIN_LADDER;
    const field = H.buildLadderField(H.planShapes(sc, 0, { mode: "now" }), sc.goal, st, { ladder });
    const sc0 = N.cellOf(field, st.x, st.y), noRoute = !(sc0 && field.dist[sc0.i] < N.BIG);
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    const clearAt = (x, y, depth, tt) => sc.obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, tt)), Infinity);
    let status = "timeout", path = 0, minClear = clearAt(st.x, st.y, st.depth, 0), ticks = 0, t = null;
    for (let i = 0; i < total; i++) {
        let target = H.hardTarget("any", s, field, sc.goal, null);
        if (spec.crab) target = { ...target, heading: crabHeading(target.heading, c) };
        const cv = ST.currentAt(sc.current, i * dt), cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError), px = s.pos[0], py = s.pos[1];
        s = res.state; ticks++;
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        const clear = clearAt(x, y, -s.pos[2], now);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = now; break; }
    }
    return { arm: armName, kind: "hard-current", strength, seed, currentMean: sc.currentMean, status, reached: status === "reached", t, path, chord: Math.hypot(sc.goal.x - st.x, sc.goal.y - st.y), minClearance: minClear, ticks, margin: field.margin, noRoute, crab: spec.crab, margin0: spec.margin ? driftMargin(c) : 0 };
}
