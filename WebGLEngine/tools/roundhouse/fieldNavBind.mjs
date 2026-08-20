// tools/roundhouse/fieldNavBind.mjs
//
// v3338 -- THE FIRST ROUNDHOUSE DEVICE WHOSE ANSWER KEY IS AN EXHAUSTIVE SEARCH RATHER THAN A FORMULA.
//
// Every graded device in this lab so far checks a measurement against algebra, an agreement between two routes,
// or a structural identity. This one grades a NAVIGATION POLICY on terrain, where no closed form for the
// cheapest path exists -- and it is gradeable anyway, because exhaustive search is exact:
//
//     Dijkstra's dist[] IS the true cost-to-go from every cell. Expensive, and correct.
//
// MODES:
//   "policy"      the local policy versus the exhaustive optimum on one terrain. The graded quantity is EXCESS
//                 COST, not arrival -- arrival alone would pass a walk that took six times the necessary route.
//   "roughness"   the same comparison swept across terrain amplitude, which is where the interesting behaviour
//                 lives: the policy is near-optimal on gentle ground and degrades hard on rough ground.
//   "complete"    does the field ever TRAP a memoryless walker? It must not: the flow is derived from an exact
//                 distance field, so it has no local minima by construction, and a loop would mean the
//                 derivation is wrong rather than the walker unlucky.
//
// WHAT IS DELIBERATELY NOT GRADED: walking downhill on dist[] itself. That reproduces the optimum to an
// off-by-one and is a TAUTOLOGY -- descending the exact cost-to-go is the definition of the shortest path. The
// policy graded here follows the FLOW VECTORS, one per cell, which is what a probe can actually see.

import { navigateRun } from "../../brain/fieldNavigate.mjs";

export const FIELDNAV_OBSERVABLES = [
    "optimalCost", "walkedCost", "excessFrac", "arrived", "looped", "steps",
    "reachableCells", "cells", "amp", "worstExcess", "bestExcess", "allArrived", "degradesWithRoughness",
];

const DEF = { n: 48, amp: 1.5, startX: 2, startZ: 2 };
const AMPS = [0.5, 1.5, 3, 6];

function buildFieldNav({ mode = "policy", config = {} } = {}) {
    const c = { ...DEF, ...config };

    if (mode === "roughness" || mode === "complete") {
        const starts = [[2, 2], [2, c.n - 4], [c.n >> 1, 4]];
        const runs = [];
        for (const amp of AMPS) for (const [sx, sz] of starts) {
            runs.push(navigateRun({ n: c.n, amp, startX: sx, startZ: sz }));
        }
        const ex = runs.map((r) => r.excessFrac);
        // does the policy get WORSE as the ground gets rougher? compare the mean excess at the two extremes
        const meanAt = (a) => {
            const g = runs.filter((r) => r.amp === a).map((r) => r.excessFrac);
            return g.reduce((s, v) => s + v, 0) / g.length;
        };
        return {
            optimalCost: null, walkedCost: null, excessFrac: null,
            arrived: runs.every((r) => r.arrived), looped: runs.some((r) => r.looped),
            steps: runs.reduce((s, r) => s + r.steps, 0),
            reachableCells: runs[0].reachableCells, cells: runs[0].cells, amp: null,
            worstExcess: Math.max(...ex), bestExcess: Math.min(...ex),
            allArrived: runs.every((r) => r.arrived),
            degradesWithRoughness: meanAt(AMPS[AMPS.length - 1]) > meanAt(AMPS[0]),
        };
    }

    // *** v3902 -- `crowflight` IS THE PLANT, AND IT CONTRADICTS THIS DEVICE'S PREMISE DIRECTLY. ***
    // The header's first line is that the answer key here is AN EXHAUSTIVE SEARCH RATHER THAN A FORMULA,
    // because no closed form for the cheapest path over terrain exists -- "Dijkstra's dist[] IS the true
    // cost-to-go from every cell. Expensive, and correct." The plant replaces that key with the closed form
    // somebody reaches for when the search looks too expensive: the STRAIGHT-LINE DISTANCE from start to goal.
    //
    // It is wrong for a reason the device is entirely about: crow-flight distance knows nothing about the
    // ground. It counts cells, not cost, so it UNDERSTATES the true optimum on any terrain worth navigating,
    // and the excess it reports is mostly the terrain the straight line refused to look at.
    //
    // A `method` plant: the walk is untouched (`walkedCost` and `steps` are bit-identical), the terrain is
    // untouched, and Dijkstra still runs -- only the number the walk is GRADED AGAINST is replaced.
    //
    // *** THE REVERSED-DIRECTION SLIP WAS TRIED FIRST AND MEASURED TOO WEAK TO USE. *** Solving the field from
    // the goal instead of the start is a real error and the cost field IS asymmetric (378.8467102 against
    // 378.4454346, ratio 0.99894), but that is a 0.1% shift against an excessFrac of 4.4% -- it would have
    // moved the observable without SEPARATING it, and a plant no key separates is not coverage.
    const r = navigateRun(c);
    const dx = (r.goalX - r.startX), dz = (r.goalZ - r.startZ);
    const crow = Math.hypot(dx, dz);
    const optimalCost = mode === "crowflight" ? crow : r.optimalCost;
    const excessFrac = optimalCost > 0 ? r.walkedCost / optimalCost - 1 : null;
    return {
        optimalCost, walkedCost: r.walkedCost, excessFrac,
        arrived: r.arrived, looped: r.looped, steps: r.steps,
        reachableCells: r.reachableCells, cells: r.cells, amp: r.amp,
        worstExcess: null, bestExcess: null, allArrived: null, degradesWithRoughness: null,
    };
}

export const FIELDNAV_MODES = ["policy", "roughness", "complete", "crowflight"];

export const fieldNavDevice = {
    modes: FIELDNAV_MODES,
    name: "field-navigation-policy", observables: FIELDNAV_OBSERVABLES, build: buildFieldNav,
    // v3902 -- REFUSES an undeclared mode rather than handing the name back, the way beamBind does. The old
    // line was `mode: mode || "policy"`, which returns any truthy name as though the device offered it.
    defaults: ({ mode } = {}) => {
        const m = mode ?? "policy";
        return FIELDNAV_MODES.includes(m) ? { mode: m, config: { ...DEF } } : null;
    },
    // `excessFrac` -- the quantity the header insists on ("EXCESS COST, not arrival -- arrival alone would pass
    // a walk that took six times the necessary route"). `arrived` and `looped` are booleans and are
    // bit-identical under this plant anyway: the walker does not know its score changed.
    plantMode: "crowflight", plantFlips: "excessFrac", plantKind: "method",
};
