// WebGLEngine/brain/subTrafficDive.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is FOLLOW-UP 8 of brain/SUB_FIELD_NAV_WIP.md, written before this file, with its
// clarification; the study is tools/ship/subTrafficDiveStudy.mjs; the gate is brain/subTrafficDive-selfcheck.mjs)
//
// WHEN NO HEADING IS CLEAR, THE LEAST BAD ONE; AND A DIVE UNDER THE KEEL. The HELD79 ship collisions were head-on ships with keels below the vessel, met when give-way had run out of
// headings (none within 90 degrees keeps a straight 30 s run clear) and fell back to the plan. Two options on top of FOLLOW-UP 7's designated arm, both on the FINAL target (after
// give-way and +free), before the sweep:
//   +leastbad  in a ship conflict with no clear give-way heading, the candidate whose straight run comes least close to the ships in conflict (Amendment 1); only the heading changes
//   +dive      in a ship conflict, down to the deepest keel in conflict + VMARGIN + DIVE_PAD, if deeper than the target and no deeper than DIVE_MAX; only the depth changes
// No clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AP from "./autopilotSub.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import * as G from "./subGiveWay.mjs";
import * as W from "./subTurnSweep.mjs";

export const DIVE_MAX = 60, DIVE_PAD = 2;
export const HELD81 = Object.freeze(N.range(7821, 7880)), DEV = G.DEV, HELD79 = W.HELD79;
export const ARMS = Object.freeze({ sweep: Object.freeze({ leastbad: false, dive: false }), "sweep+leastbad": Object.freeze({ leastbad: true, dive: false }),
    "sweep+dive": Object.freeze({ leastbad: false, dive: true }), "sweep+leastbad+dive": Object.freeze({ leastbad: true, dive: true }) });
export const ARM_NAMES = Object.freeze(Object.keys(ARMS)), DESIGNATED = "sweep+leastbad+dive", REFERENCE = "sweep", BASE = "ref+free+giveway+sweep";

/** AMENDMENT 1 (brain/SUB_FIELD_NAV_WIP.md): a straight run's CLOSEST PREDICTED APPROACH to `ships` over the horizon (the minimum distance less r + HULL_HALF), or -Infinity when the
 *  run leaves the region margin (HULL_HALF + INSIDE) within the horizon. Every whole second 0..horizon, as runClear samples. */
export function closestApproach(x, y, h, v, t, ships, { horizon = H.HORIZON_S } = {}) {
    const vx = v * Math.cos(h), vy = -v * Math.sin(h), R = N.REGION, m = N.HULL_HALF + G.INSIDE;
    let best = Infinity;
    for (let k = 0; k <= horizon; k++) {
        const px = x + vx * k, py = y + vy * k;
        if (px < R.x0 + m || px > R.x1 - m || py < R.y0 + m || py > R.y1 - m) return -Infinity;
        for (const o of ships) { const [ox, oy] = H.posAt(o, t + k); best = Math.min(best, Math.hypot(px - ox, py - oy) - o.r - N.HULL_HALF); }
    }
    return best;
}
/** The least bad heading (Amendment 1): among give-way's candidates around `heading`, the one with the largest closest approach to `ships` (ties to the earlier offset), if it is
 *  larger than `heading`'s own; else null. */
export function leastBadHeading(state, heading, t, ships) {
    const a = S.attitude(state), x = state.pos[0], y = state.pos[1], own = closestApproach(x, y, heading, a.speed, t, ships);
    let best = null, bestC = own;
    for (const d of G.OFFSETS) { const h = heading + (d * Math.PI) / 180, c = closestApproach(x, y, h, a.speed, t, ships); if (c > bestC) { bestC = c; best = h; } }
    return best;
}
/** The ships in conflict (shipConflict's test, ship by ship). */
export function conflictShips(state, t, obstacles, { minDepth = -Infinity, horizon = H.HORIZON_S, clear = H.YIELD_CLEAR } = {}) {
    return obstacles.filter((o) => o.type === "ship" && o.keel + H.VMARGIN > minDepth && H.shipConflict(state, t, [o], { at: H.posAt, horizon, clear, minDepth }));
}
/** The dive depth for a conflict: the deepest keel + VMARGIN + DIVE_PAD, or null when there is no conflict or it is deeper than DIVE_MAX. */
export function diveDepth(ships, diveMax = DIVE_MAX) {   // diveMax: FOLLOW-UP 10's +under passes 70; the default is the registered 60
    if (!ships.length) return null;
    const d = Math.max(...ships.map((o) => o.keel)) + H.VMARGIN + DIVE_PAD;
    return d <= diveMax ? d : null;
}
/** The options as a pilot: transforms the target, then FOLLOW-UP 7's sweep, then the autopilot. `stats` counts the ticks each option acted and the deepest depth. */
export function trafficPilot(sc, { leastbad = false, dive = false, base = (s, t, c) => AP.decide(s, t, c), dt = S.DT, diveMax = DIVE_MAX } = {}) {
    const sweep = W.sweepPilot(base), stats = { leastbadTicks: 0, diveTicks: 0, deepest: 0 }; let i = 0;
    const pilot = (s, target, cv) => {
        const t = i * dt; i++; let tgt = target;
        stats.deepest = Math.max(stats.deepest, -s.pos[2]);
        if (leastbad || dive) {
            const ships = conflictShips(s, t, sc.obstacles, { minDepth: sc.minDepth });
            if (ships.length) {
                if (leastbad && G.giveWayHeading(s, tgt, t, sc.obstacles, sc.minDepth) === null) { const h = leastBadHeading(s, tgt.heading, t, ships); if (h !== null) { tgt = { ...tgt, heading: h }; stats.leastbadTicks++; } }
                if (dive) { const d = diveDepth(ships, diveMax); if (d !== null && d > tgt.depth) { tgt = { ...tgt, depth: d }; stats.diveTicks++; } }
            }
        }
        return sweep.pilot(s, tgt, cv);
    };
    return { pilot, stats, sweepStats: sweep.stats };
}
/** One flight of an arm: subGiveWay's ref+free+giveway with the options and the sweep as the pilot. The record is flyGiveWay's plus { arm, leastbadTicks, diveTicks, deepest, sweepTicks, sweepTurns }. */
export function flyTraffic(sc, armName, o = {}) {
    const a = ARMS[armName]; if (!a) throw new Error(`subTrafficDive.flyTraffic: unknown arm "${armName}" (${ARM_NAMES.join(", ")})`);
    const tp = trafficPilot(sc, { ...a, base: o.base }), rec = G.flyGiveWay(tp.pilot, sc, "ref+free+giveway", o.seconds ? { seconds: o.seconds } : {});
    return { ...rec, arm: armName, leastbadTicks: tp.stats.leastbadTicks, diveTicks: tp.stats.diveTicks, deepest: tp.stats.deepest, sweepTicks: tp.sweepStats.overridden, sweepTurns: tp.sweepStats.forced };
}
export const KIND = W.KIND, scenarioOf = W.scenarioOf;
