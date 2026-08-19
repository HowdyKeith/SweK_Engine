// brain/fieldNavigate.mjs
//
// v3338 -- NAVIGATING A FIELD WITH NO CLOSED FORM, AND THE ANSWER KEY THAT MAKES IT GRADEABLE.
//
// The probe tour at v3337 moved between circular orbits, where every station has an exact L and the route is a
// sequence of keyed arrivals. Terrain has no such formula: the cheapest path across a cost field is not something
// you can write down. That is the case Keith asked about, and the reason it is still gradeable is that
//
//     EXHAUSTIVE SEARCH IS EXACT EVEN WHEN NO FORMULA EXISTS.
//
// flowfieldCpu.js is a multi-source Dijkstra: its dist[] IS the true cost-to-go from every cell, computed in
// shortest-path order. Expensive, and correct. That is a perfectly good answer key -- and it is precisely why an
// approximation is worth measuring rather than admiring.
//
// *** THE THING THAT MUST NOT BE GRADED, AND IT LOOKS LIKE THE OBVIOUS TEST. *** Walking downhill on dist[]
// itself reproduces the optimal cost to within an off-by-one on the first cell -- ratio 0.9989. That is a
// TAUTOLOGY: descending the exact cost-to-go is the definition of the shortest path, so the measurement can only
// come back "optimal" and proves nothing about anything.
//
// WHAT A PROBE ACTUALLY CONSUMES IS THE FLOW FIELD: one direction vector per cell, no global view, no memory.
// Following it is a real policy that can be worse than optimal, and the exact field says by how much:
//
//     terrain amplitude   excess cost over optimal
//     0.5                 0.18% - 1.53%
//     1.5                 0.51% - 4.37%
//     3                   0.92% - 205.8%
//     6                   227.9% - 517.7%
//
// Near-optimal on gentle ground, and up to SIX TIMES the optimal cost on rough ground -- while still arriving
// every time. Both halves matter: the field is complete (it has no local minima, because it is derived from an
// exact distance field) and its EFFICIENCY degrades with roughness. A device grading only arrival would call the
// amplitude-6 run a success.

import { FlowFieldSolverCPU } from "./flowfieldCpu.js";

export const WATER_BASE = 10;   // stay above WATER_LEVEL = 8 so the map is land, not a swim test

/** Deterministic ridged terrain: rough enough to make routing non-trivial, seeded so a failure reproduces. */
export function terrain(n, amp) {
    const a = new Float32Array(n * n);
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++)
        a[z * n + x] = WATER_BASE + amp * Math.sin(x * 0.18) * Math.cos(z * 0.15)
                                  + amp * 0.5 * Math.sin((x + z) * 0.11);
    return a;
}

/**
 * Follow the FLOW VECTORS from a start cell -- the local policy, one step at a time, snapping to the dominant
 * axis. Returns the cost actually walked and whether the goal was reached.
 *
 * Cycle detection is not decoration: a field WITH a local minimum would trap a memoryless walker forever, and
 * "ran out of steps" and "went in a circle" are different diagnoses.
 */
export function followField(n, field, cost, cell, startX, startZ) {
    const { dist, fx, fz } = field;
    let i = startZ * n + startX, walked = 0, steps = 0, looped = false;
    const seen = new Set();
    while (dist[i] > 0 && steps < 20 * n * n) {
        if (seen.has(i)) { looped = true; break; }
        seen.add(i);
        steps++;
        const x = i % n, z = (i / n) | 0;
        let nx = x, nz = z;
        if (Math.abs(fx[i]) >= Math.abs(fz[i])) nx += Math.sign(fx[i]); else nz += Math.sign(fz[i]);
        if (nx < 0 || nz < 0 || nx >= n || nz >= n || (nx === x && nz === z)) break;
        const j = nz * n + nx;
        walked += cost[j] * cell;
        i = j;
    }
    return { walked, steps, looped, arrived: dist[i] === 0, endIndex: i };
}

/**
 * Grade the local policy against exhaustive search on the same terrain.
 * optimal comes from Dijkstra; walked comes from following the vectors a probe can actually see.
 */
export function navigateRun({ n = 48, amp = 1.5, startX = 2, startZ = 2, goalX = null, goalZ = null } = {}) {
    const gx = goalX == null ? n - 2 : goalX, gz = goalZ == null ? n - 2 : goalZ;
    const heights = terrain(n, amp);
    const solver = new FlowFieldSolverCPU(null, n, n, {});
    const field = solver.solveSync(heights, [{ gx, gy: gz }], { wantDist: true });

    const optimal = field.dist[startZ * n + startX];
    const walk = followField(n, field, solver._cost, solver.cell, startX, startZ);

    // how much of the map the exhaustive search had to settle to produce the key
    let reachable = 0;
    for (const v of field.dist) if (v < 1e8) reachable++;

    return {
        n, amp, startX, startZ, goalX: gx, goalZ: gz,
        optimalCost: optimal,
        walkedCost: walk.walked,
        excessFrac: optimal > 0 ? walk.walked / optimal - 1 : null,
        arrived: walk.arrived, looped: walk.looped, steps: walk.steps,
        reachableCells: reachable, cells: n * n,
    };
}
