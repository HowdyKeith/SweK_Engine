// WebGLEngine/brain/subNavPlus.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/NAV_PLUS_WIP.md, the gate is brain/subNavPlus-selfcheck.mjs)
//
// THREE OPEN NAVIGATION ITEMS ON TOP OF brain/subHardNav.mjs (which is NOT edited): (1) the margin sweep (MARGIN_VARIANTS: other top rungs of the ladder, other vertical margins), (2) a field that knows the current (the hard-current-gap kind; a current
// estimate from the vessel's water-speed and ground-speed logs; a crab heading; a top rung that grows with the current), (3) reacting traffic (the hard-reactive kind: ships that turn away or stop; a velocity estimated from where a ship is seen).
// `flyPlus` is `subHardNav.flyHard` with those options; WITH EVERY NEW OPTION OFF IT RETURNS flyHard's RESULT TO THE DIGIT (the gate holds that). OPTIMISTIC, said plainly: a perfect position fix, an exact static map, perfect logs, ships whose positions are
// seen exactly. Pure: no DOM, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";

export const PLUS_KINDS = Object.freeze(["hard-current-gap", "hard-reactive"]);
export const ALL_KINDS = Object.freeze([...H.HARD_KINDS, ...PLUS_KINDS]);
export const PLUS_SETS = Object.freeze({ dev: N.range(1, 30), held70: N.range(7001, 7060), held71: N.range(7101, 7200), held72: N.range(7201, 7260) });
// item 2: the current estimate's time constant (s) and the margin's growth per m/s of current (s: the 35 m turn radius over the 3 m/s cruise)
export const TAU_C = 15, CUR_K = 12;
// item 3: a ship's reaction (registered in NAV_PLUS_WIP.md) and the plan's velocity filter
export const SENSE = 150, SHIP_CLEAR = 30, SHIP_HORIZON = 30, SHIP_TURN_RATE = 0.15, SHIP_MAX_TURN = Math.PI / 3, SHIP_DECEL = 0.5, SHIP_HOLD = 10, TAU_V = 6;
export const BEHAVIOURS = Object.freeze(["holds", "turns", "stops"]);

/** Item 1: the variants of the margin sweep: { ladder, vmargin }. `m12` is the incumbent (HELD4's ladder, the vertical margin 5 m). */
export const MARGIN_VARIANTS = Object.freeze({
    m12: Object.freeze({ ladder: H.MARGIN_LADDER, vmargin: H.VMARGIN }), m16: Object.freeze({ ladder: Object.freeze([16, 12, 8, 6, 3]), vmargin: H.VMARGIN }), m10: Object.freeze({ ladder: Object.freeze([10, 8, 6, 3]), vmargin: H.VMARGIN }),
    m8: Object.freeze({ ladder: Object.freeze([8, 6, 3]), vmargin: H.VMARGIN }), m6: Object.freeze({ ladder: Object.freeze([6, 3]), vmargin: H.VMARGIN }), v0: Object.freeze({ ladder: H.MARGIN_LADDER, vmargin: 0 }), v10: Object.freeze({ ladder: H.MARGIN_LADDER, vmargin: 10 }),
});
export const INCUMBENT = "m12";
/** Items 2 and 3: the arms: { base (an arm of subHardNav), crab ("none" | "est" | "mean"), curK (the top rung grows by curK x |current estimate|; replans every REPLAN_S), ships ("assumed" | "est": the velocity the plan gives each ship) }. */
const parm = (base, crab = "none", curK = 0, ships = "assumed") => Object.freeze({ base, crab, curK, ships });
export const PLUS_ARMS = Object.freeze({
    any: parm("any"), "any+crab": parm("any", "est"), "any+crab+margin": parm("any", "est", CUR_K), "any+crab-mean": parm("any", "mean"),
    "any+replan": parm("any+replan"), "any+predict": parm("any+predict"), "any+predict+edge+yield": parm("any+predict+edge+yield"), "any+predict-est": parm("any+predict", "none", 0, "est"), "any+predict-est+edge+yield": parm("any+predict+edge+yield", "none", 0, "est"),
});
export const ARMS_OF_PLUS = Object.freeze({
    "hard-current": Object.freeze(["any", "any+crab", "any+crab+margin", "any+crab-mean"]), "hard-current-gap": Object.freeze(["any", "any+crab", "any+crab+margin", "any+crab-mean"]),
    "hard-reactive": Object.freeze(["any+replan", "any+predict", "any+predict+edge+yield", "any+predict-est", "any+predict-est+edge+yield"]),
});
export const DESIGNATED_PLUS = Object.freeze({ current: "any+crab+margin", reactive: "any+predict-est+edge+yield" });

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * A scenario of any kind: the four of subHardNav as they are; `hard-current-gap` = the wall and gap of `hard-gaps` for the seed, in the current and the weight error of `hard-current` for the same seed (kind and currentMean restated); `hard-reactive` = the scenario of
 * `hard-traffic` for the seed, each ship given a behaviour ("holds", "turns", "stops": one third each, from a stream of its own) and `reactive: true`.
 */
export function plusScenario(seed, kind) {
    if (!ALL_KINDS.includes(kind)) throw new Error(`subNavPlus.plusScenario: unknown kind "${kind}" (${ALL_KINDS.join(", ")})`);
    if (H.HARD_KINDS.includes(kind)) return H.hardScenario(seed, kind);
    if (kind === "hard-current-gap") {
        const gap = H.hardScenario(seed, "hard-gaps"), cur = H.hardScenario(seed, "hard-current");
        return Object.freeze({ ...gap, kind, current: cur.current, weightError: cur.weightError, currentMean: cur.currentMean });
    }
    const base = H.hardScenario(seed, "hard-traffic"), r = mulberry((seed * 7919 + 77003) >>> 0);
    const obstacles = base.obstacles.map((o) => (o.type === "ship" ? Object.freeze({ ...o, behaviour: BEHAVIOURS[Math.min(2, Math.floor(r() * 3))] }) : o));
    return Object.freeze({ ...base, kind, obstacles: Object.freeze(obstacles), reactive: true });
}
/** The scenarios of a set for the kinds given. */
export const plusSetOf = (name, kinds) => { if (!PLUS_SETS[name]) throw new Error(`subNavPlus.plusSetOf: unknown set "${name}" (${Object.keys(PLUS_SETS).join(", ")})`); return Object.freeze(kinds.flatMap((k) => PLUS_SETS[name].map((s) => plusScenario(s, k)))); };

/** One step of an exponential average: the new estimate after `sample` over `dt` seconds with time constant `tau` (the estimate when it has none yet is the sample). */
export const emaStep = (est, sample, dt, tau) => (est === null ? sample : est + (sample - est) * (1 - Math.exp(-dt / tau)));
/**
 * The heading to ask for to make good `bearing` in a current `c` ([cx, cy], m/s) at through-water speed V: bearing + asin(c_n / V), c_n the current's component along n = (sin b, cos b) (to the left of a track that points along (cos b, -sin b), x east, y north), the ratio clamped to [-1, 1].
 * Water velocity plus the current then points along the bearing. A stopped or fast-current vessel (V under 0.5 m/s) gets the bearing as it is.
 */
export function crabHeading(bearing, c, V) {
    if (!(V >= 0.5)) return bearing;
    const cn = c[0] * Math.sin(bearing) + c[1] * Math.cos(bearing);
    return bearing + Math.asin(clamp(cn / V, -1, 1));
}
/** The top rung of the ladder for a current estimate `c` ([cx, cy]): rung 0 + K x |c|, the lower rungs as they are. */
export const ladderFor = (ladder, curK, c) => (curK > 0 ? [ladder[0] + curK * Math.hypot(c[0], c[1]), ...ladder.slice(1)] : ladder);

// ---- a ship that answers ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A ship's state at the start of a flight: its position and original velocity, the turn angle and speed scale its behaviour moves, the time since its last conflict, and the velocity filter. */
export const newShip = (o) => ({ o, x: o.x, y: o.y, vx0: o.vx, vy0: o.vy, theta: 0, k: 1, clear: Infinity, vhx: 0, vhy: 0, seen: false, px: o.x, py: o.y, reacted: 0 });
const rot = (vx, vy, a) => [vx * Math.cos(a) - vy * Math.sin(a), vx * Math.sin(a) + vy * Math.cos(a)];
/** The ship's present velocity (its original velocity turned by theta and scaled by k). */
export const shipVel = (sh) => { const [x, y] = rot(sh.vx0, sh.vy0, sh.theta); return [x * sh.k, y * sh.k]; };
/** The closest approach (m, centre to centre) over the next `horizon` s, sampled every second, of a ship at (x, y) with velocity (vx, vy) and a vessel at (ax, ay) with velocity (bx, by). */
export function closest(x, y, vx, vy, ax, ay, bx, by, horizon = SHIP_HORIZON) {
    let m = Infinity;
    for (let k = 0; k <= horizon; k++) m = Math.min(m, Math.hypot(x + vx * k - (ax + bx * k), y + vy * k - (ay + by * k)));
    return m;
}
/** Does the vessel (ground position and velocity: ax, ay, bx, by) and this ship, each holding its velocity, come within r + half-hull + SHIP_CLEAR in the next SHIP_HORIZON s, with the vessel within SENSE now? */
export function shipConflicts(sh, ax, ay, bx, by) {
    if (Math.hypot(sh.x - ax, sh.y - ay) > SENSE) return false;
    const [vx, vy] = shipVel(sh);
    return closest(sh.x, sh.y, vx, vy, ax, ay, bx, by) < sh.o.r + N.HULL_HALF + SHIP_CLEAR;
}
/**
 * One tick of a ship (mutates `sh`): react by its behaviour to the vessel (ax, ay, bx, by), then move. "holds": nothing. "turns": while a conflict stands, rotate toward the side that gives the larger closest approach at SHIP_TURN_RATE up to SHIP_MAX_TURN from the original course;
 * after SHIP_HOLD s with no conflict, rotate back. "stops": while a conflict stands, slow at SHIP_DECEL m/s^2 toward zero; after SHIP_HOLD s with none, speed up the same way. Returns whether the ship was in conflict.
 */
export function shipStep(sh, ax, ay, bx, by, dt) {
    const b = sh.o.behaviour || "holds", conflict = b !== "holds" && shipConflicts(sh, ax, ay, bx, by), v0 = Math.hypot(sh.vx0, sh.vy0);
    if (conflict) sh.clear = 0; else sh.clear += dt;
    if (b === "turns") {
        if (conflict) {
            const step = SHIP_TURN_RATE * dt, side = (sg) => { const [vx, vy] = rot(sh.vx0, sh.vy0, clamp(sh.theta + sg * step, -SHIP_MAX_TURN, SHIP_MAX_TURN)); return closest(sh.x, sh.y, vx, vy, ax, ay, bx, by); };
            const sg = side(1) >= side(-1) ? 1 : -1;
            sh.theta = clamp(sh.theta + sg * step, -SHIP_MAX_TURN, SHIP_MAX_TURN); sh.reacted++;
        } else if (sh.clear > SHIP_HOLD) { const step = SHIP_TURN_RATE * dt; sh.theta = Math.abs(sh.theta) <= step ? 0 : sh.theta - Math.sign(sh.theta) * step; }
    } else if (b === "stops" && v0 > 0) {
        if (conflict) { sh.k = Math.max(0, sh.k - SHIP_DECEL * dt / v0); sh.reacted++; } else if (sh.clear > SHIP_HOLD) sh.k = Math.min(1, sh.k + SHIP_DECEL * dt / v0);
    }
    const [vx, vy] = shipVel(sh);
    sh.x += vx * dt; sh.y += vy * dt;
    return conflict;
}
/** The velocity filter: the plan sees the ship's position every tick; its velocity estimate is an exponential average (TAU_V) of the per-tick difference of position, started at the first difference. */
export function shipSee(sh, dt) {
    const dx = (sh.x - sh.px) / dt, dy = (sh.y - sh.py) / dt;
    if (!sh.seen) { sh.vhx = dx; sh.vhy = dy; sh.seen = true; } else { sh.vhx = emaStep(sh.vhx, dx, dt, TAU_V); sh.vhy = emaStep(sh.vhy, dy, dt, TAU_V); }
    sh.px = sh.x; sh.py = sh.y;
}

let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));

/**
 * Fly one scenario with `pilot` under `armName` (a name of PLUS_ARMS or of subHardNav's HARD_ARMS). Options: seconds, dt, model, yieldSpeed, horizon (as flyHard), `ladder` and `vmargin` (item 1), `tauC`, `curK` (item 2; overrides the arm's), `shipsMode` (overrides the arm's). Returns flyHard's record plus
 * { crab, curK, ships, cEst60 ([x, y] of the current estimate at t = 60 s, or null), cMean ([x, y] of the scenario's mean current), hit (the behaviour of the ship hit, "static" for anything else, null if no collision), reacted (ticks in which any ship answered) }.
 * With the arm in subHardNav's names, a non-reactive scenario and the default options the flight is flyHard's to the digit.
 */
export function flyPlus(pilot, sc, armName, o = {}) {
    const pa = PLUS_ARMS[armName] || (H.HARD_ARMS.includes(armName) ? parm(armName) : null);
    if (!pa) throw new Error(`subNavPlus.flyPlus: unknown arm "${armName}" (${[...Object.keys(PLUS_ARMS), ...H.HARD_ARMS].join(", ")})`);
    const { seconds = H.SECONDS_HARD, dt = S.DT, model = navModel(), ladder = H.MARGIN_LADDER, vmargin = H.VMARGIN, yieldSpeed = H.YIELD_SPEED, horizon = H.HORIZON_S, tauC = TAU_C } = o;
    const curK = o.curK === undefined ? pa.curK : o.curK, shipsMode = o.shipsMode || pa.ships, crab = o.crab || pa.crab, spec = H.ARM_SPEC[pa.base], total = Math.round(seconds / dt), st = sc.start, every = Math.max(1, Math.round(H.REPLAN_S / dt));
    const mode = spec.replan === "predict" ? "predict" : "now", reactive = !!sc.reactive, scV = vmargin === H.VMARGIN ? sc : { ...sc, minDepth: sc.minDepth - (vmargin - H.VMARGIN) };
    const meanC = sc.current ? [sc.current.mean[0], sc.current.mean[1]] : [0, 0], replans = spec.replan !== "none" || curK > 0;
    // the ships: simulated (reactive) or on the position function (not), and what the plan is told about them
    const ships = sc.obstacles.filter((x) => x.type === "ship").map(newShip), shipOf = new Map(ships.map((sh) => [sh.o, sh])), custom = reactive || shipsMode !== "assumed";
    const atNow = reactive ? (ob) => { const sh = shipOf.get(ob); return sh ? [sh.x, sh.y] : [ob.x, ob.y]; } : H.posAt;
    const world = (t, how) => {   // the obstacles as the plan is told of them at time t: ships at their observed positions with the velocity the arm assumes
        const list = sc.obstacles.map((ob) => {
            const sh = shipOf.get(ob); if (!sh) return ob;
            const px = reactive ? sh.x : ob.x + ob.vx * t, py = reactive ? sh.y : ob.y + ob.vy * t, est = how === "est";
            return { ...ob, x: px, y: py, vx: est ? sh.vhx : ob.vx, vy: est ? sh.vhy : ob.vy };
        });
        return { ...scV, obstacles: list };
    };
    const shapes = (t) => (custom ? H.planShapes(world(t, shipsMode), 0, { mode, blind: spec.blind, horizon }) : H.planShapes(scV, t, { mode, blind: spec.blind, horizon }));
    let cEst = null, cEst60 = null;
    const cNow = () => cEst || [0, 0];
    let field = spec.field ? H.buildLadderField(shapes(0), sc.goal, st, { ladder, edgeExtra: spec.edge }) : null, nReplans = 0, reacted = 0, hit = null;
    const field0 = field, sc0 = field ? N.cellOf(field, st.x, st.y) : null, noRoute = field ? !(sc0 && field.dist[sc0.i] < N.BIG) : false;
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    let status = "timeout", path = 0, minClear = clearOf(sc.obstacles, st.x, st.y, st.depth, 0, atNow), ticks = 0, t = null;
    for (let i = 0; i < total; i++) {
        if (replans && i > 0 && i % every === 0) { field = H.buildLadderField(shapes(i * dt), sc.goal, { x: s.pos[0], y: s.pos[1] }, { ladder: ladderFor(ladder, curK, cNow()), own: { x: s.pos[0], y: s.pos[1] }, edgeExtra: spec.edge }); nReplans++; }
        const cv = ST.currentAt(sc.current, i * dt), ctx = custom ? { obstacles: world(i * dt, shipsMode).obstacles, t: 0, at: H.posAt, minDepth: scV.minDepth, yieldSpeed } : { obstacles: sc.obstacles, t: i * dt, at: H.posAt, minDepth: scV.minDepth, yieldSpeed };
        let target = H.hardTarget(pa.base, s, field, sc.goal, ctx);
        if (crab !== "none") target = { ...target, heading: crabHeading(target.heading, crab === "mean" ? meanC : cNow(), S.attitude(s, cv).speed) };
        const cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError);
        const px = s.pos[0], py = s.pos[1], vgx = s.vel[0], vgy = s.vel[1];
        s = res.state; ticks++;
        if (crab === "est" || curK > 0) { cEst = [emaStep(cEst ? cEst[0] : null, cv[0], dt, tauC), emaStep(cEst ? cEst[1] : null, cv[1], dt, tauC)]; if (cEst60 === null && (i + 1) * dt >= 60) cEst60 = [cEst[0], cEst[1]]; }
        if (reactive) { for (const sh of ships) { if (shipStep(sh, px, py, vgx, vgy, dt)) reacted++; shipSee(sh, dt); } } else if (shipsMode === "est") for (const sh of ships) { const now = (i + 1) * dt; sh.x = sh.o.x + sh.o.vx * now; sh.y = sh.o.y + sh.o.vy * now; shipSee(sh, dt); }
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        const clear = clearOf(sc.obstacles, x, y, -s.pos[2], now, atNow);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; const ob = sc.obstacles.find((q) => H.gapTo(q, x, y, -s.pos[2], now, atNow) < 0); hit = ob && ob.type === "ship" ? (ob.behaviour || "holds") : "static"; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = now; break; }
    }
    return { arm: armName, kind: sc.kind, seed: sc.seed, gap: sc.gapWidth, shipSpeed: sc.shipSpeed, currentMean: sc.currentMean, blocked: sc.blocked, status, reached: status === "reached", t, path, chord: Math.hypot(sc.goal.x - st.x, sc.goal.y - st.y), minClearance: minClear, ticks, margin: field0 ? field0.margin : null, marginLast: field ? field.margin : null, noRoute, replans: nReplans, crab, curK, ships: shipsMode, cEst60, cMean: meanC, hit, reacted };
}
const clearOf = (obstacles, x, y, depth, t, at) => obstacles.reduce((m, ob) => Math.min(m, H.gapTo(ob, x, y, depth, t, at)), Infinity);

/** Every scenario's arms of its kind (ARMS_OF_PLUS, or subHardNav's ARMS_OF), scenario-major: the list of flyPlus results. */
export function evaluatePlus(pilot, scenarios, opts = {}) {
    const runs = [];
    for (const sc of scenarios) for (const arm of (ARMS_OF_PLUS[sc.kind] || H.ARMS_OF[sc.kind])) runs.push(flyPlus(pilot, sc, arm, opts));
    return runs;
}
