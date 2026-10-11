// WebGLEngine/tools/ship/pathCost-selfcheck.mjs -- v4538
//
// Run: node tools/ship/pathCost-selfcheck.mjs
//
// GATES nav/pathCost.mjs and the A* cost term in nav/navmesh.mjs's corridor(), which backlog item
// "navmesh-recast" piece (2) has carried as unguarded since the navmesh shipped. The item asked for a
// fixture that distinguishes `g + distance` from a flat `g + 1`. That was the wrong question and the round
// says so: the trap map on file punishes GREEDINESS, both models are greedy once the heuristic dominates,
// and two greedy searches agreeing tells you nothing about either. Ranking the routes OPPOSITELY by metres
// and by polygon count is the question, and asking it found the cost term was not merely untested.
//
// ---- SABOTAGES, WITH THEIR RESULTS --------------------------------------------------------------------
//
//   A  the entry point put back to the portal MIDPOINT      2 RED, sections 1 and 3 -- and A IS THE DEFECT
//                                                          ITSELF, so this row is the repair being undone.
//   B  the entry point aimed at the GOAL instead            2 RED, sections 1 and 3, at the same 36.6%. The
//                                                          obvious other guess, and it buys nothing.
//   C  the clamp on t removed, so the entry leaves the span 2 RED, sections 1 and 3.
//   D  witness() made to plan the direct route for each leg 2 RED, sections 1 and 3 -- a witness that is the
//                                                          answer reports 0% excess on any planner.
//
// *** B WENT 0 RED ON ITS FIRST DRAFT AND THAT IS RECORDED RATHER THAN QUIETLY FIXED. *** It was written as
// `(seg, from, goal) => { from = goal || from; ... }`, and `enter` is called with TWO arguments, so `goal`
// was undefined, `goal || from` was `from`, and the sabotage was a no-op that changed nothing. A sabotage
// that goes 0 red is a finding about the sabotage until proven otherwise: the input never reached the
// guarded branch. Redone against the goal actually in scope, it goes red like the rest.
"use strict";
import * as NM from "../../nav/navmesh.mjs";
import * as PC from "../../nav/pathCost.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const pct = (x) => (x * 100).toFixed(1) + "%";

const F = PC.competingRoutes();
const mesh = NM.buildNavmesh(F.hm, { stride: F.stride, seedX: F.start.x, seedZ: F.start.z, radius: 0 });

// =============================================================================================================
console.log("\n1. *** THE PLANNER DECLINED A ROUTE IT CAN ITSELF FIND, AND SPLITTING THE QUERY PROVES IT ***");
{
    const near = PC.witness(mesh, F.start, F.goal, [F.midway]);
    const mid = PC.witness(mesh, F.start, F.goal, [F.midway], { entry: "midpoint" });
    ok("!! *** ENTERING A PORTAL AT ITS NEAREST POINT COSTS NOTHING AGAINST THE SPLIT-QUERY WITNESS ***",
        near && near.excess !== null && Math.abs(near.excess) < 0.01,
        near ? near.direct.length.toFixed(2) + " m direct against " + near.split.length.toFixed(2) +
        " m through one waypoint -- " + pct(near.excess) + " excess. *** THE WITNESS NEEDS NO ORACLE: *** " +
        "both of its legs are routes THIS planner returned on THIS mesh, so a direct answer longer than " +
        "their sum is the planner declining a route it can find." : "no path");
    ok("!! *** AND THE MIDPOINT COST MODEL THIS ROUND REPLACED DECLINES EXACTLY THAT ***",
        mid && mid.excess !== null && mid.excess > 0.2,
        mid ? mid.direct.length.toFixed(2) + " m direct against the same " + mid.split.length.toFixed(2) +
        " m witness -- " + pct(mid.excess) + " LONGER. *** g CHAINED ENTRY POINT TO PORTAL MIDPOINT, AND A " +
        "MIDPOINT IS AN ARBITRARY POINT ON THE PORTAL, *** so a long portal let g cut a corner the polygon " +
        "does not permit and how much it cut depended on POLYGON SIZE. Measured: on the L route g accumulates " +
        "100.10 for a path the funnel walks in 193.13 -- under-priced by 48.2% -- while on the hundred-hop " +
        "diagonal it reads 140.71 against a walked 141.42, accurate to half a per cent. The search was " +
        "discounting routes made of few large polygons in proportion to how large they were." : "no path");
    report("the item asked for a fixture separating g + distance from g + 1. Both take the L here, because " +
           "both under-price it: the polygon-count model prefers 5 polygons to 101 and the metre model was " +
           "reading 100.10 for 193.13. Two models agreeing while both are wrong is why no fixture found this.");
}

// =============================================================================================================
console.log("\n2. *** THE WITNESS IS A WITNESS AND NOT THE ANSWER, WHICH IS THE ONLY REASON IT PROVES ANYTHING ***");
{
    const w = PC.witness(mesh, F.start, F.goal, [F.midway]);
    const legA = NM.planPath(mesh, F.start, F.midway), legB = NM.planPath(mesh, F.midway, F.goal);
    ok("!! each leg of the witness is a real plan, and the two legs are not the direct query",
        legA && legB && Math.abs(legA.length + legB.length - w.split.length) < 1e-9 &&
        legA.points.length >= 2 && legB.points.length >= 2,
        "leg 1 " + legA.length.toFixed(2) + " m over " + legA.polys + " polygons, leg 2 " +
        legB.length.toFixed(2) + " m over " + legB.polys + " polygons, summing to " + w.split.length.toFixed(2) +
        ". A witness built by asking for the answer would report 0% excess on any planner, however bad.");
    ok("   ...and it claims existence, never optimality",
        w.split.length >= F.straight - 1e-9,
        "the witness is " + w.split.length.toFixed(2) + " m against a straight line of " + F.straight.toFixed(2) +
        ". *** 0% EXCESS DOES NOT MEAN OPTIMAL *** -- it means this witness did not beat the answer, and a " +
        "sharper witness might. The row above can convict and cannot acquit, and saying so is the point.");
}

// =============================================================================================================
console.log("\n3. *** THE READING IS A PROPERTY OF THE GEOMETRY, NOT OF ONE DRAWING OF IT ***");
{
    const rows = [];
    for (const halfWidth of [2, 3, 4]) for (const corner of [110, 130]) {
        const f = PC.competingRoutes({ halfWidth, corner });
        const m = NM.buildNavmesh(f.hm, { stride: f.stride, seedX: f.start.x, seedZ: f.start.z, radius: 0 });
        const a = PC.witness(m, f.start, f.goal, [f.midway]);
        const b = PC.witness(m, f.start, f.goal, [f.midway], { entry: "midpoint" });
        if (a && b && a.excess !== null && b.excess !== null) rows.push({ halfWidth, corner, a: a.excess, b: b.excess });
    }
    ok("!! *** AT EVERY WIDTH AND EVERY DETOUR LENGTH: THE NEAREST ENTRY IS CLEAN AND THE MIDPOINT IS NOT ***",
        rows.length >= 6 && rows.every((r) => Math.abs(r.a) < 0.01) && rows.every((r) => r.b > 0.2),
        rows.length + " geometries. nearest: " + rows.map((r) => pct(r.a)).join(", ") +
        ".  midpoint: " + rows.map((r) => pct(r.b)).join(", ") + ". A defect that showed at one corridor " +
        "width and one detour length would be a defect about that width and that length.");
    for (const r of rows) report("halfWidth " + r.halfWidth + ", corner " + r.corner + ": nearest " +
        pct(r.a) + ", midpoint " + pct(r.b));
}

// =============================================================================================================
console.log("\n4. *** AND IT MOVES NOTHING THAT WAS ALREADY MEASURED, WHICH IS THE OTHER HALF OF THE FINDING ***");
{
    const N = 512;
    const gapMap = () => { const hm = new Float32Array(N * N);
        for (let z = 0; z < N; z++) if (z < 40 || z > 60) for (let x = 96; x <= 104; x++) hm[z * N + x] = 999;
        return hm; };
    const diagonal = () => { const hm = new Float32Array(N * N);
        for (let t = 0; t < 400; t++) if (t < 150 || t > 190)
            for (let w = -4; w <= 4; w++) { const x = 60 + t + w, z = 60 + t;
                if (x >= 0 && z >= 0 && x < N && z < N) hm[z * N + x] = 999; }
        return hm; };
    const same = [];
    for (const [name, hm, opts, s, g] of [
        ["obstacle", gapMap(), { stride: N, seedX: 40, seedZ: 40, radius: 1.9 }, { x: 40, z: 40 }, { x: 400, z: 180 }],
        ["45-degree", diagonal(), { stride: N, seedX: 80, seedZ: 200, radius: 1.9, supersample: 2 }, { x: 80, z: 200 }, { x: 300, z: 120 }],
    ]) {
        const m = NM.buildNavmesh(hm, opts);
        const a = NM.planPath(m, s, g), b = NM.planPath(m, s, g, { entry: "midpoint" });
        same.push({ name, moved: !(a && b && Math.abs(a.length - b.length) < 1e-9 &&
            a.points.length === b.points.length && a.polys === b.polys),
            len: a ? a.length : NaN, corners: a ? a.points.length : 0, polys: a ? a.polys : 0 });
    }
    ok("!! the two cost models agree exactly on every fixture the tree already had",
        same.every((r) => !r.moved),
        same.map((r) => r.name + " " + r.len.toFixed(2) + " m / " + r.corners + " corners / " + r.polys +
        " polygons" + (r.moved ? " *** MOVED ***" : "")).join("; ") + ". *** SO NO GATE THE TREE HAD WOULD " +
        "CATCH THIS REPAIR BEING UNDONE, *** which is why the fixture above exists rather than a row added " +
        "to an existing section. The old model is kept reachable as an option for exactly this comparison.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether the nearest-point entry is OPTIMAL. It is not -- it is a tighter " +
    "under-estimate than the midpoint and one that no longer varies with polygon size, which is what made " +
    "the old one rank routes wrongly. A cost that matched the funnel exactly would have to know the whole " +
    "corridor before choosing it, and this does not claim to. Also unchecked: the heuristic, which is " +
    "Euclidean and admissible against true distance but is paired with a g that under-estimates, so the " +
    "pair is not a consistent A* and the search can still settle a node early; and every geometry where " +
    "three or more routes compete, since this fixture offers exactly two.");
process.exit(fails ? 1 : 0);
