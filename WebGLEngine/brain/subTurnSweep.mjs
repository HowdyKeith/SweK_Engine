// WebGLEngine/brain/subTurnSweep.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is FOLLOW-UP 7 of brain/SUB_FIELD_NAV_WIP.md, written before this file;
// the study is tools/ship/subTurnSweepStudy.mjs; the gate is brain/subTurnSweep-selfcheck.mjs)
//
// A TURN THAT CHECKS ITS OWN SWEEP. The HELD78 exits were plan reversals near the edge: the target heading flips by about 180 degrees and the autopilot takes the half-turn the
// short way, which in every traced case swept through the heading pointing at the edge. `+sweep` sits between the plan and the autopilot, on the FINAL target (after give-way
// and +free): when the target is more than 90 degrees off the heading it predicts each direction's turn from a table of the vessel's own measured turn and, if the short way
// leaves the region and the long way does not, commands the heading 90 degrees ahead in the long way, latched until the vessel is within 90 degrees of the target.
// No clock, no Math.random. The table is measured from the model once, lazily.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AP from "./autopilotSub.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import * as G from "./subGiveWay.mjs";

export const TRIGGER_DEG = 90, LEAD_DEG = 90, TABLE_STEP_DEG = 5, SWEEP_PAD = 10, INSIDE = 3, TABLE_DEPTH = 20, SETTLE_S = 30, TABLE_MAX_S = 200;
export const HELD79 = Object.freeze(N.range(7601, 7660)), DEV = G.DEV, HELD78 = G.HELD78;
/** The arms: the give-way arm flown underneath and whether the sweep is on. */
export const ARMS = Object.freeze({ ref: Object.freeze({ base: "ref", sweep: false }), "ref+sweep": Object.freeze({ base: "ref", sweep: true }),
    "ref+free+giveway": Object.freeze({ base: "ref+free+giveway", sweep: false }), "ref+free+giveway+sweep": Object.freeze({ base: "ref+free+giveway", sweep: true }) });
export const ARM_NAMES = Object.freeze(Object.keys(ARMS)), DESIGNATED = "ref+free+giveway+sweep";

export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const RAD = Math.PI / 180;
let TABLE = null, MODEL = null;
const model = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));
/** The measured turn: [{ deg, dx, dy }] every TABLE_STEP_DEG from 0 to 180, the displacement from the turn's start of a vessel at cruise on heading 0 turning toward
 *  +heading with the target held LEAD_DEG ahead (the same command the sweep gives). Measured from the model once; frozen. */
export function turnTable() {
    if (TABLE) return TABLE;
    const m = model(), cv = [0, 0, 0];
    let s = S.createState({ pos: [0, 0, -TABLE_DEPTH], speed: N.CRUISE, heading: 0, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: m });
    for (let i = 0; i < Math.round(SETTLE_S / S.DT); i++) s = S.stepSub(m, s, AP.decide(s, { heading: 0, depth: TABLE_DEPTH, speed: N.CRUISE }, cv), S.DT, cv, 0).state;
    const x0 = s.pos[0], y0 = s.pos[1], out = [{ deg: 0, dx: 0, dy: 0 }];
    let turned = 0, prev = S.attitude(s).heading, t = 0;
    while (out.length <= 180 / TABLE_STEP_DEG && t < TABLE_MAX_S) {
        const h = S.attitude(s).heading;
        s = S.stepSub(m, s, AP.decide(s, { heading: h + LEAD_DEG * RAD, depth: TABLE_DEPTH, speed: N.CRUISE }, cv), S.DT, cv, 0).state; t += S.DT;
        const h2 = S.attitude(s).heading; turned += wrap(h2 - prev); prev = h2;
        while (out.length <= 180 / TABLE_STEP_DEG && turned >= out.length * TABLE_STEP_DEG * RAD) out.push({ deg: out.length * TABLE_STEP_DEG, dx: s.pos[0] - x0, dy: s.pos[1] - y0 });
    }
    if (out.length <= 180 / TABLE_STEP_DEG) throw new Error(`subTurnSweep.turnTable: the turn did not reach 180 degrees in ${TABLE_MAX_S} s`);
    return (TABLE = Object.freeze(out.map((p) => Object.freeze(p))));
}
/** The predicted points of a turn from (x, y) on heading h in direction d (+1 or -1) through `deg` degrees (capped at 180): the table mirrored for d and rotated to h
 *  (a heading h points along (cos h, -sin h), as the field's do). */
export function sweepPoints(x, y, h, d, deg, table = turnTable()) {
    const c = Math.cos(h), s = Math.sin(h), lim = Math.min(180, deg);
    return table.filter((p) => p.deg <= lim + 1e-9).map((p) => { const dy = d * p.dy; return [x + p.dx * c + dy * s, y - p.dx * s + dy * c]; });
}
export const MARGIN_IN = N.HULL_HALF + INSIDE + SWEEP_PAD;
/** Is every point at least MARGIN_IN from every edge of the region? */
export const inside = (pts, R = N.REGION, m = MARGIN_IN) => pts.every(([x, y]) => x - R.x0 >= m && R.x1 - x >= m && y - R.y0 >= m && R.y1 - y >= m);
/** The decision at one tick, pure: { dir (the direction to force, or 0 for none), why }. `err` is wrap(target - heading). */
export function decide(x, y, h, err, table = turnTable()) {
    if (Math.abs(err) <= TRIGGER_DEG * RAD) return { dir: 0, why: "small" };
    const nat = err >= 0 ? 1 : -1, need = Math.abs(err) / RAD;
    if (inside(sweepPoints(x, y, h, nat, need, table))) return { dir: 0, why: "short way inside" };
    if (inside(sweepPoints(x, y, h, -nat, 360 - need, table))) return { dir: -nat, why: "long way" };
    return { dir: 0, why: "both out" };
}
/** A pilot that applies the sweep to the target it is given and then flies `base` (the autopilot). `stats` counts the ticks it overrode and the turns it forced. */
export function sweepPilot(base = (s, t, c) => AP.decide(s, t, c)) {
    let latch = 0; const stats = { overridden: 0, forced: 0 };
    const pilot = (s, target, cv) => {
        const h = S.attitude(s).heading, err = wrap(target.heading - h);
        if (latch !== 0 && Math.abs(err) <= TRIGGER_DEG * RAD) latch = 0;
        if (latch === 0) { const dcs = decide(s.pos[0], s.pos[1], h, err); if (dcs.dir !== 0) { latch = dcs.dir; stats.forced++; } }
        if (latch === 0) return base(s, target, cv);
        stats.overridden++;
        return base(s, { ...target, heading: h + latch * LEAD_DEG * RAD }, cv);
    };
    return { pilot, stats };
}
/** One flight of an arm: subGiveWay's flight of the arm's base, with the sweep's pilot when the arm has it. The record is flyGiveWay's plus { arm, sweepTicks, sweepTurns }. */
export function flySweep(sc, armName, { base = (s, t, c) => AP.decide(s, t, c), ...o } = {}) {
    const a = ARMS[armName]; if (!a) throw new Error(`subTurnSweep.flySweep: unknown arm "${armName}" (${ARM_NAMES.join(", ")})`);
    if (!a.sweep) return { ...G.flyGiveWay(base, sc, a.base, o), arm: armName, sweepTicks: 0, sweepTurns: 0 };
    const sp = sweepPilot(base), rec = G.flyGiveWay(sp.pilot, sc, a.base, o);
    return { ...rec, arm: armName, sweepTicks: sp.stats.overridden, sweepTurns: sp.stats.forced };
}
export const KIND = "hard-traffic";
export const scenarioOf = (seed) => H.hardScenario(seed, KIND);
