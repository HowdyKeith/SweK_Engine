// WebGLEngine/brain/floodTask.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLOOD, ONCE: a hull breach the ballast tank cannot trim out. brain/subTask.mjs asks a pilot to hold a depth with a vessel that is within 0.6% of neutral; this asks the same of a vessel that starts to take on 4% to 8% of its own weight
// in water a few seconds in -- more than the tank's 3% range, so the PD autopilot (brain/autopilotSub.mjs) blows the tank to the stop and still sinks (its ballast law has no integrator and no idea there is a floor), the vessel
// grounds, and the dive is over. What saves it is the DROP WEIGHT (physics/mechanics/subModel6dof.mjs, v4901): a one-way release of 6% of the weight that covers the worst leak, and the emergency blow that
// buys the seconds the release needs. brain/emergencyPilot.mjs is the wrapper that pulls both; this file is the job it is graded on.
//
// THE VESSEL is the EXPLORER with a tank: a pump that moves 0.25 level units a second, an air bottle of 1.5 (one full blow from flooded is 2, so it is NOT enough to blow the tank empty at the normal rate -- the pilot has to
// spend air with care), an emergency blow at 1.5 a second that costs twice the air per unit, and a drop weight of 6%.
// THE SCENARIO is a seed: a start depth 25..35 m (the target is that depth, so the ask is "stay where you are"), a leak of 4%..8% that begins at 5 s and builds over 5 s, a speed of 1.5..2.5 m/s.
// THE SCORE of a dive is the one fact that matters: did the vessel stay up. Every dive is 120 s; a dive that ends (grounded at 50 m, crushed at 100 m, broached) ends there. `held` = the dive finished submerged and within
// 12 m of its target depth; `maxDepth` is how far it went.
//
// Pure: no DOM, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";

export const SECONDS = 120, LEAK_AT = 5, LEAK_BUILD = 5;
export const FLOOD_SPEC = Object.freeze({ ...S.EXPLORER, name: "explorer-flood", tankRate: 0.25, airMax: 1.5, emergencyRate: 1.5, emergencyAirCost: 2, dropMass: 0.06 });
let MODEL = null;
export const floodModel = () => MODEL || (MODEL = S.createSubModel(FLOOD_SPEC));

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** { seed, depth, speed, leak (the fraction of the weight taken on, at full) } -- frozen, a seed always makes the same one. */
export function scenario(seed) {
    const r = mulberry((seed * 7919 + 61) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    return Object.freeze({ seed, depth: u(25, 35), speed: u(1.5, 2.5), leak: u(0.04, 0.08) });
}
/** The weight error at time t: nothing until LEAK_AT, then a ramp over LEAK_BUILD seconds to the full leak. */
export const leakAt = (sc, t) => sc.leak * Math.min(1, Math.max(0, (t - LEAK_AT) / LEAK_BUILD));

/** Fly one flood with `pilot` ((state, target, current) -> controls). Returns { status, held, maxDepth, finalDepth, released, tAbove (seconds until the vessel is first shallower than the target after the leak, or null) }. */
export function fly(pilot, sc, { seconds = SECONDS, dt = S.DT, model = floodModel() } = {}) {
    let s = S.createState({ depth: sc.depth, speed: sc.speed, model }), status = "submerged", maxDepth = sc.depth;
    const target = { depth: sc.depth, heading: 0, speed: sc.speed }, total = Math.round(seconds / dt);
    for (let i = 0; i < total; i++) {
        const res = S.stepSub(model, s, pilot(s, target, [0, 0, 0]), dt, [0, 0, 0], leakAt(sc, i * dt));
        s = res.state;
        if (res.status !== "submerged") { status = res.status; break; }
        const d = -s.pos[2]; if (d > maxDepth) maxDepth = d;
    }
    const finalDepth = -s.pos[2];
    return { seed: sc.seed, status, held: status === "submerged" && Math.abs(finalDepth - sc.depth) <= 12, maxDepth, finalDepth, released: !!(s.tank && s.tank.released), air: s.tank ? s.tank.air : null };
}

export const FLOOD_SET = Object.freeze(Array.from({ length: 24 }, (_, i) => scenario(i + 1)));
/** `pilot` over a set: { held (how many), ended (how many dives ended early), runs }. */
export function evaluate(pilot, set = FLOOD_SET, opts = {}) {
    const runs = set.map((sc) => fly(pilot, sc, opts));
    return { held: runs.filter((r) => r.held).length, ended: runs.filter((r) => r.status !== "submerged").length, n: runs.length, runs };
}
