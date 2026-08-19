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

    const r = navigateRun(c);
    return {
        optimalCost: r.optimalCost, walkedCost: r.walkedCost, excessFrac: r.excessFrac,
        arrived: r.arrived, looped: r.looped, steps: r.steps,
        reachableCells: r.reachableCells, cells: r.cells, amp: r.amp,
        worstExcess: null, bestExcess: null, allArrived: null, degradesWithRoughness: null,
    };
}

export const fieldNavDevice = {
    modes: ["policy", "roughness", "complete"],
    name: "field-navigation-policy", observables: FIELDNAV_OBSERVABLES, build: buildFieldNav,
    defaults: ({ mode } = {}) => ({ mode: mode || "policy", config: { ...DEF } }),
};
