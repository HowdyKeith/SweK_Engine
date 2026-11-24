// WebGLEngine/brain/subDeepTransit.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is FOLLOW-UP 9 of brain/SUB_FIELD_NAV_WIP.md, written before this file;
// the study is tools/ship/subDeepTransitStudy.mjs; the gate is brain/subDeepTransit-selfcheck.mjs)
//
// A DEEP TRANSIT, BENEATH THE TRAFFIC FROM THE START. FOLLOW-UP 8's dive went under a ship's keel only once a conflict was predicted 30 s out. +deep holds the vessel, from the start,
// below the deepest keel it can pass under (keel + VMARGIN + DIVE_PAD <= DIVE_MAX), until it is ASCEND_M from the goal on the plane, then gives way to the goal's depth. Only the depth
// changes, only deeper, on the final target, before FOLLOW-UP 8's dive and FOLLOW-UP 7's sweep (both kept). No clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AP from "./autopilotSub.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import * as G from "./subGiveWay.mjs";
import * as D from "./subTrafficDive.mjs";

export const ASCEND_M = 140;
export const HELD82 = Object.freeze(N.range(7881, 7940)), DEV = G.DEV, HELD81 = D.HELD81;
export const ARMS = Object.freeze({ "sweep+dive": Object.freeze({ deep: false }), "sweep+dive+deep": Object.freeze({ deep: true }) });
export const ARM_NAMES = Object.freeze(Object.keys(ARMS)), DESIGNATED = "sweep+dive+deep", REFERENCE = "sweep+dive";
// FOLLOW-UP 10 (registered first): +under lets the transit and the dive go to UNDER_MAX (every keel the generator makes, at most 60 m, is then passable at no more than 67 m); +beneath
// drops, tick by tick, the ships whose keel + VMARGIN is at or above the vessel's depth from what the plan, the give-way, the yield and the dive see (bergs untouched)
export const UNDER_MAX = 70, HELD88 = Object.freeze(N.range(10201, 10400));
export const ARMS10 = Object.freeze({ "sweep+dive+deep": Object.freeze({ deep: true }), "sweep+dive+deep+under+beneath": Object.freeze({ deep: true, under: true, beneath: true }), "sweep+dive+deep+under": Object.freeze({ deep: true, under: true }) });
export const ARM10_NAMES = Object.freeze(Object.keys(ARMS10)), DESIGNATED10 = "sweep+dive+deep+under+beneath", REFERENCE10 = "sweep+dive+deep", ATTRIBUTION10 = "sweep+dive+deep+under";

/** The transit depth of a scenario: the deepest keel among its ships that can be passed under, + VMARGIN + DIVE_PAD; null when no ship can be. */
export function transitDepth(sc, diveMax = D.DIVE_MAX) {
    const ok = sc.obstacles.filter((o) => o.type === "ship" && o.keel + H.VMARGIN + D.DIVE_PAD <= diveMax);
    return ok.length ? Math.max(...ok.map((o) => o.keel)) + H.VMARGIN + D.DIVE_PAD : null;
}
/** The deep target: the transit depth while the vessel is more than ASCEND_M from the goal on the plane and the transit is deeper than the target; else the target as it is. */
export function deepTarget(state, target, goal, transit) {
    if (transit === null || transit <= target.depth || Math.hypot(goal.x - state.pos[0], goal.y - state.pos[1]) <= ASCEND_M) return target;
    return { ...target, depth: transit };
}
/** One flight of an arm: FOLLOW-UP 8's sweep+dive, with +deep ahead of it when the arm has it. The record is flyGiveWay's plus { arm, deepTicks, transit, diveTicks, deepest, sweepTicks, sweepTurns }. */
export function flyDeep(sc0, armName, { base = (s, t, c) => AP.decide(s, t, c), measure = false } = {}) {   // measure: FOLLOW-UP 10 adds minShipClear and hiddenShipTicks to the record (off: the record is FOLLOW-UP 9's, field for field)
    const a = ARMS[armName] || ARMS10[armName]; if (!a) throw new Error(`subDeepTransit.flyDeep: unknown arm "${armName}" (${[...ARM_NAMES, ...ARM10_NAMES.filter((n) => !ARMS[n])].join(", ")})`);
    const diveMax = a.under ? UNDER_MAX : D.DIVE_MAX; let depthNow = sc0.start.depth, minShipClear = Infinity, tick = 0, hidden = 0;
    // +beneath: a view of the scenario whose obstacles, read at any moment, leave out the ships the vessel is at least VMARGIN beneath (a ship that could be hit is never left out)
    const sc = a.beneath ? Object.freeze(Object.defineProperty({ ...sc0 }, "obstacles", { get: () => sc0.obstacles.filter((o) => !(o.type === "ship" && o.keel + H.VMARGIN <= depthNow)), enumerable: true })) : sc0;
    const tp = D.trafficPilot(sc, { dive: true, base, diveMax }), transit = a.deep ? transitDepth(sc0, diveMax) : null; let deepTicks = 0;
    const pilot = (s, tgt, cv) => {
        depthNow = -s.pos[2];
        // the minimum ship clearance (reported): the larger of the horizontal gap less radius and half-hull and the vertical gap below the keel, over every ship of the FULL list
        const t = tick * S.DT; tick++;
        if (measure) for (const o of sc0.obstacles) if (o.type === "ship") { const [ox, oy] = H.posAt(o, t), c = Math.max(Math.hypot(s.pos[0] - ox, s.pos[1] - oy) - o.r - N.HULL_HALF, depthNow - H.VRADIUS - o.keel); if (c < minShipClear) minShipClear = c; if (a.beneath && o.keel + H.VMARGIN <= depthNow) hidden++; }
        const t2 = a.deep ? deepTarget(s, tgt, sc0.goal, transit) : tgt; if (t2 !== tgt) deepTicks++; return tp.pilot(s, t2, cv);
    };
    const rec = G.flyGiveWay(pilot, sc, "ref+free+giveway");
    return { ...rec, arm: armName, deepTicks, transit, diveTicks: tp.stats.diveTicks, deepest: tp.stats.deepest, sweepTicks: tp.sweepStats.overridden, sweepTurns: tp.sweepStats.forced, ...(measure ? { minShipClear, hiddenShipTicks: hidden } : {}) };
}
export const KIND = D.KIND, scenarioOf = D.scenarioOf;
