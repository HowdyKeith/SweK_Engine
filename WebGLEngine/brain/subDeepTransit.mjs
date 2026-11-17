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

/** The transit depth of a scenario: the deepest keel among its ships that can be passed under, + VMARGIN + DIVE_PAD; null when no ship can be. */
export function transitDepth(sc) {
    const ok = sc.obstacles.filter((o) => o.type === "ship" && o.keel + H.VMARGIN + D.DIVE_PAD <= D.DIVE_MAX);
    return ok.length ? Math.max(...ok.map((o) => o.keel)) + H.VMARGIN + D.DIVE_PAD : null;
}
/** The deep target: the transit depth while the vessel is more than ASCEND_M from the goal on the plane and the transit is deeper than the target; else the target as it is. */
export function deepTarget(state, target, goal, transit) {
    if (transit === null || transit <= target.depth || Math.hypot(goal.x - state.pos[0], goal.y - state.pos[1]) <= ASCEND_M) return target;
    return { ...target, depth: transit };
}
/** One flight of an arm: FOLLOW-UP 8's sweep+dive, with +deep ahead of it when the arm has it. The record is flyGiveWay's plus { arm, deepTicks, transit, diveTicks, deepest, sweepTicks, sweepTurns }. */
export function flyDeep(sc, armName, { base = (s, t, c) => AP.decide(s, t, c) } = {}) {
    const a = ARMS[armName]; if (!a) throw new Error(`subDeepTransit.flyDeep: unknown arm "${armName}" (${ARM_NAMES.join(", ")})`);
    const tp = D.trafficPilot(sc, { dive: true, base }), transit = a.deep ? transitDepth(sc) : null; let deepTicks = 0;
    const pilot = (s, tgt, cv) => { const t2 = a.deep ? deepTarget(s, tgt, sc.goal, transit) : tgt; if (t2 !== tgt) deepTicks++; return tp.pilot(s, t2, cv); };
    const rec = G.flyGiveWay(pilot, sc, "ref+free+giveway");
    return { ...rec, arm: armName, deepTicks, transit, diveTicks: tp.stats.diveTicks, deepest: tp.stats.deepest, sweepTicks: tp.sweepStats.overridden, sweepTurns: tp.sweepStats.forced };
}
export const KIND = D.KIND, scenarioOf = D.scenarioOf;
