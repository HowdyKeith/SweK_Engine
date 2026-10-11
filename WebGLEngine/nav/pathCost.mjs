// WebGLEngine/nav/pathCost.mjs -- v4538
//
// *** THE A* COST MODEL WAS UNGUARDED, AND WHEN IT WAS FINALLY MEASURED IT WAS ALSO WRONG. ***
//
// Backlog item "navmesh-recast" piece (2) has stood open since the navmesh shipped, filed like this:
// replacing `g + distance` with a flat `g + 1` changes NO path on any fixture, including a trap map built
// to punish it, so a fixture that discriminates the two is owed and until one exists that line of
// corridor() is untested. The trap map it describes is an outer wall whose gap points straight at the goal
// opening into a dead chamber, against a second gap that is a clean shot.
//
// *** THAT FIXTURE COULD NEVER HAVE DISCRIMINATED ANYTHING, AND THE REASON SAYS WHAT THE REAL QUESTION IS. ***
// It punishes GREEDINESS. Both cost models are greedy once the heuristic dominates, so both fall for it in
// exactly the same way and agreeing proves nothing about either. What separates the two models is not greed,
// it is the UNIT: one counts metres and the other counts polygons. So the fixture had to be one where the
// two routes are ranked OPPOSITELY by metres and by polygon count -- and building that found something
// bigger than the question it was built for.
//
// ---- THE MEASUREMENT ---------------------------------------------------------------------------------
//
// Two routes from the same start to the same goal:
//   ROUTE D, a 45-degree diagonal band. Shortest on the ground, and the row sweep staircases it into ~100
//            thin rectangles, so it is EXPENSIVE in polygons.
//   ROUTE L, an L round two edges. Longer on the ground, axis-aligned, FIVE polygons, cheap in polygons.
//
// The planner returns 193.13 m. The mesh contains a 141.42 m route and THE SAME PLANNER FINDS IT -- ask it
// for start to the diagonal's midpoint and it answers 70.71 m, ask it for midpoint to goal and it answers
// 70.71 m again. Split the query and the answer improves by 36.6%. That is not a fixture artefact and it
// needs no oracle to believe: the two halves are routes this mesh really contains, because this planner
// planned them.
//
// ---- WHY, AND IT IS ONE LINE -------------------------------------------------------------------------
//
// `g` chained ENTRY POINT -> PORTAL MIDPOINT. The midpoint is an arbitrary point on the portal, so a long
// portal lets g cut a corner the polygon does not permit, and HOW MUCH IT CUTS DEPENDS ON POLYGON SIZE.
// Measured on the L: g accumulates 100.10 over two portals for a route the funnel walks in 193.13 -- it
// UNDER-PRICES BY 48.2%. On the diagonal, a hundred short hops, g reads 140.71 against a walked 141.42:
// accurate to half a per cent. So the search was not comparing like with like. It was systematically
// discounting routes made of few large polygons, in proportion to how large they were.
//
// Entering each portal at the point NEAREST TO WHERE THE PATH CAME FROM, rather than at its middle, returns
// 141.42 m -- the witness exactly, +0.0%. Aiming the entry at the GOAL instead does nothing (193.13, the
// same wrong answer), which is worth recording because it is the obvious other guess.
//
// *** AND IT MOVES NOTHING THAT WAS ALREADY MEASURED. *** On the obstacle fixture, 386.76 m / 3 corners /
// 7 polygons before and after. On the 45-degree fixture, 261.10 m / 5 corners / 105 polygons before and
// after. Every nav gate stays green. Which is the other half of the finding: the repair is invisible to
// every fixture the tree had, so no existing gate would catch it being undone.
//
// ---- WHAT THIS MODULE IS -----------------------------------------------------------------------------
//
// The witness, so the claim needs no trusted optimum. A path is only known to be beatable when something
// exhibits a shorter one, and the cheapest thing that can is the planner itself, asked twice.
"use strict";
import { planPath } from "./navmesh.mjs";

/**
 * Plan start -> goal in one query, and again through `waypoints`, and report both.
 *
 * *** THE SPLIT ANSWER IS A WITNESS AND NOT AN ORACLE, WHICH IS WHY THIS IS WORTH HAVING. *** It does not
 * claim to be optimal; it claims to EXIST, because every leg of it is a route the planner itself returned
 * on the same mesh. So `excess > 0` means the planner declined a route it can find, which is a statement
 * about the planner and needs nothing outside it to check. `excess === 0` proves only that this particular
 * witness did not beat it -- never that the answer is optimal -- and the gate says so rather than implying
 * otherwise.
 */
export function witness(mesh, s, g, waypoints = [], opts = {}) {
    const direct = planPath(mesh, s, g, opts);
    if (!direct) return null;
    const stops = [s, ...waypoints, g];
    let total = 0, polys = 0, corners = 0;
    for (let i = 1; i < stops.length; i++) {
        const leg = planPath(mesh, stops[i - 1], stops[i], opts);
        if (!leg) return { direct, split: null, excess: null, reason: "leg " + i + " has no path" };
        total += leg.length; polys += leg.polys; corners += leg.points.length;
    }
    return {
        direct, split: { length: total, polys, corners },
        excess: direct.length > 0 ? direct.length / total - 1 : 0,
    };
}

/**
 * The fixture: two routes ranked oppositely by metres and by polygon count.
 *
 * *** THE WIDTH AND THE CORNER ARE PARAMETERS BECAUSE A SINGLE SHAPE IS A COINCIDENCE. *** A defect that
 * appears at one corridor width and one detour length is a defect that might be about that width and that
 * length; the gate sweeps them so the reading is a property of the geometry rather than of one drawing.
 */
export function competingRoutes({ n = 256, halfWidth = 3, corner = 110, lo = 10, hi = 110 } = {}) {
    const WALL = 999;
    const hm = new Float32Array(n * n).fill(WALL);
    const open = (x, z) => { if (x >= 0 && z >= 0 && x < n && z < n) hm[z * n + x] = 0; };
    for (let t = lo; t <= hi; t++) for (let w = -halfWidth; w <= halfWidth; w++) { open(t + w, t); open(t, t + w); }
    for (let x = lo; x <= corner; x++) for (let w = -halfWidth; w <= halfWidth; w++) open(x, lo + w);
    for (let z = lo; z <= hi; z++) for (let w = -halfWidth; w <= halfWidth; w++) open(corner + w, z);
    for (let x = hi; x <= corner; x++) for (let w = -halfWidth; w <= halfWidth; w++) open(x, hi + w);
    for (let w = -halfWidth; w <= halfWidth; w++) { open(lo + w, lo); open(lo, lo + w); open(hi + w, hi); open(hi, hi + w); }
    return {
        hm, stride: n,
        start: { x: lo, z: lo }, goal: { x: hi, z: hi },
        midway: { x: (lo + hi) / 2, z: (lo + hi) / 2 },
        straight: Math.hypot(hi - lo, hi - lo),
    };
}

/**
 * *** RE-DERIVED BY tools/ship/pathCost-selfcheck.mjs ON EVERY RUN. *** These are readings of this tree at
 * v4538, kept so a later round can see which of them moved and not so a check can compare one to itself.
 */
export const COST_AT_V4538 = Object.freeze({
    midpointLength: 193.13,        // what the shipped cost model returned on the fixture
    nearestLength: 141.42,         // what entering at the nearest point returns
    witnessLength: 141.42,         // and what the split query proves the mesh contains
    midpointExcessPct: 36.6,
    nearestExcessPct: 0.0,
    ellUnderpricedPct: 48.2,       // g reads 100.10 for a route the funnel walks in 193.13
    diagonalErrorPct: -0.5,        // g reads 140.71 against a walked 141.42
    ellPolys: 5,
    diagonalPolys: 101,
    shippedFixturesMoved: 0,       // obstacle and 45-degree fixtures are identical before and after
});
