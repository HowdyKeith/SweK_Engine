// WebGLEngine/physics/mesh/meshCSG-selfcheck.mjs -- v4542
//
// Run: node physics/mesh/meshCSG-selfcheck.mjs
//
// GATES physics/mesh/meshCSG.mjs (BSP mesh booleans, method from evanw/csg.js, MIT) and the trianglesInBox
// query added to mesh/meshBVH.mjs this round.
//
// *** THE ONE RULE THIS GATE IS BUILT AROUND: A BOOLEAN IS GRADED ON THE SOLID, NOT ON THE MESH. *** The
// whole-wall path and the localised path produce DIFFERENT POLYGON LISTS for the same cut -- 20,647 polygons
// against 8,979 -- and the localised one is the better mesh, because clipping a polygon through a BSP splits
// it along planes it lies nowhere near. A gate that diffed polygon lists would be red on a correct
// optimisation, and the fix would then be to make the fast path reproduce the slow path's waste. So the
// invariants asserted here are VOLUME and the partition identity, which no amount of re-cutting can move.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./meshCSG.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const area3 = (a, b, c) => 0.5 * Math.hypot(...cross(sub(b, a), sub(c, a)));

// the edge census this whole round turned on -- an unmatched edge is only a CRACK if nothing covers it
function edgeCensus(polys) {
    const E = [];
    for (const p of polys) for (let i = 0; i < p.vs.length; i++) {
        const a = p.vs[i], b = p.vs[(i + 1) % p.vs.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 1e-12) E.push([a, b]);
    }
    const Q = 1e-9, key = (v) => [Math.round(v[0] / Q), Math.round(v[1] / Q), Math.round(v[2] / Q)].join(",");
    const ex = new Map();
    for (const [a, b] of E) ex.set(key(a) + "|" + key(b), (ex.get(key(a) + "|" + key(b)) || 0) + 1);
    let matched = 0, tj = 0, gap = 0, worstGap = 0;
    for (const [a, b] of E) {
        if ((ex.get(key(b) + "|" + key(a)) || 0) === 1 && (ex.get(key(a) + "|" + key(b)) || 0) === 1) { matched++; continue; }
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...ab), u = ab.map((x) => x / L);
        const spans = [];
        for (const [c, d] of E) {
            const dc = [d[0] - c[0], d[1] - c[1], d[2] - c[2]], L2 = Math.hypot(...dc);
            if (L2 < 1e-12 || (dc[0] * u[0] + dc[1] * u[1] + dc[2] * u[2]) / L2 > -0.9999999) continue;
            const off = (P) => {
                const av = [P[0] - a[0], P[1] - a[1], P[2] - a[2]];
                const t = av[0] * u[0] + av[1] * u[1] + av[2] * u[2];
                return Math.hypot(av[0] - t * u[0], av[1] - t * u[1], av[2] - t * u[2]) < 1e-7 ? t : null;
            };
            const t1 = off(c), t2 = off(d);
            if (t1 === null || t2 === null) continue;
            const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(L, Math.max(t1, t2));
            if (hi > lo + 1e-12) spans.push([lo, hi]);
        }
        spans.sort((m2, n2) => m2[0] - n2[0]);
        let cov = 0, end = 0;
        for (const [lo, hi] of spans) { const st = Math.max(lo, end); if (hi > st) { cov += hi - st; end = hi; } }
        const miss = L - cov;
        if (miss < 1e-9 * Math.max(1, L)) tj++; else { gap++; if (miss > worstGap) worstGap = miss; }
    }
    return { edges: E.length, matched, tj, gap, worstGap };
}

const WALL = () => M.boxPolys([0, 0, 0], [4, 3, 0.3]);
const BLOB = (k) => M.jaggedBlob([(k % 5 - 2) * 1.4, ((k * 7) % 5 - 2) * 1.0, 0], 0.9, 8, 1000 + k * 37);

console.log("meshCSG-selfcheck -- an exact hole in a wall, and what 'gap-free' does and does not mean\n");

// =============================================================================================================
console.log("1. the primitives, before anything is cut out of them");
{
    const w = WALL();
    ok("!! a box's volume is exactly a*b*c", M.volume(w) === 8 * 6 * 0.6 || rel(M.volume(w), 28.8) < 1e-15,
        M.volume(w).toFixed(12) + " vs 28.8");
    ok("   ...and its area is exactly 2(ab+bc+ca)", rel(M.surfaceArea(w), 2 * (48 + 4.8 + 3.6)) < 1e-12,
        M.surfaceArea(w).toFixed(6));
    ok("!! the box is closed, and every one of its 24 directed edges has exactly one partner",
        M.watertight(w).ok, JSON.stringify(M.watertight(w)));
    ok("   ...and convex, which is what makes the fan triangulator legal", M.allConvex(w).ok);
    // *** THE BLOB'S POLES WERE A HOLE AND THE VOLUME IS WHAT FOUND IT. *** Giving every ring vertex its own
    // radius made the i=0 ring M DISTINCT POINTS ON THE Y AXIS rather than one pole, so the cap triangles were
    // collinear, got dropped as degenerate, and the blob shipped open. It rendered and it subtracted.
    const smooth = M.jaggedBlob([0, 0, 0], 1, 16, 1, { rough: 0, floor: 1 });
    ok("!! *** the blast shape is CLOSED -- the check that caught a hole at each pole ***",
        M.watertight(smooth).ok, JSON.stringify(M.watertight(smooth)));
    const errs = [8, 16, 32].map((n) => {
        const s = M.jaggedBlob([0, 0, 0], 1, n, 1, { rough: 0, floor: 1 });
        return Math.abs(M.volume(s) - 4 / 3 * Math.PI);
    });
    ok("!! ...and an inscribed sphere CONVERGES to 4/3 pi r^3 at SECOND ORDER, from below",
        errs[0] > errs[1] && errs[1] > errs[2] &&
        Math.abs(errs[0] / errs[1] - 4) < 0.6 && Math.abs(errs[1] / errs[2] - 4) < 0.6 &&
        M.volume(M.jaggedBlob([0, 0, 0], 1, 32, 1, { rough: 0, floor: 1 })) > 0,
        "|error| at subdiv 8/16/32 = " + errs.map((e) => e.toFixed(4)).join(" / ") + ", ratios " +
        (errs[0] / errs[1]).toFixed(2) + " and " + (errs[1] / errs[2]).toFixed(2) + " -- halving the facet " +
        "quarters the error, which is what an inscribed polyhedron does and a mere 'it got smaller' would not " +
        "have said. An inverted winding would make the volume NEGATIVE, which is how the first draft's " +
        "inside-out body was caught.");
    ok("   the blast shape is reproducible from its seed",
        JSON.stringify(M.jaggedBlob([0, 0, 0], 1, 6, 42)) === JSON.stringify(M.jaggedBlob([0, 0, 0], 1, 6, 42)));
    ok("   ...and a different seed is a different shape",
        JSON.stringify(M.jaggedBlob([0, 0, 0], 1, 6, 42)) !== JSON.stringify(M.jaggedBlob([0, 0, 0], 1, 6, 43)));
}

// =============================================================================================================
console.log("\n2. *** THE PARTITION IDENTITY -- the check that grades a boolean without looking at a mesh ***");
{
    const A = WALL(), B = M.jaggedBlob([0, 0, 0], 1.0, 8, 12345);
    const dif = M.subtract(A, B), int = M.intersect(A, B), uni = M.union(A, B);
    const resid = Math.abs(M.volume(A) - M.volume(dif) - M.volume(int));
    ok("!! *** V(A - B) + V(A AND B) = V(A), to 1e-13 ***", resid < 1e-12,
        "residual " + resid.toExponential(3) + " on a volume of " + M.volume(A).toFixed(6) +
        " -- the two halves of A tile it exactly, which no polygon comparison could establish");
    const du = Math.abs(M.volume(uni) - (M.volume(A) + M.volume(B) - M.volume(int)));
    ok("!! ...and V(A OR B) = V(A) + V(B) - V(A AND B), which ties the third operator to the other two",
        du < 1e-9, "residual " + du.toExponential(3));
    // *** THE WASTE, IN ITS PUREST FORM, AND MY FIRST DRAFT OF THIS CHECK ASSERTED THE OPPOSITE AND WAS RED. ***
    // I wrote "subtracting something nowhere near changes the volume by exactly nothing". It does not change
    // the volume MUCH -- but it is not exact, and the polygon count explodes, because clipTo pushes every
    // polygon of A through B's whole BSP and B's planes are INFINITE. A blast fifty units away still shatters
    // the wall. That is the entire argument for localising, and it is better as a measurement than as prose.
    const far = M.jaggedBlob([50, 50, 50], 1, 6, 7);
    const farWhole = M.subtract(A, far), farLocal = M.subtractLocal(A, far);
    // and again on a wall that has already been hit, where the same mechanism is worth more than a doubling
    let hit = A;
    for (let k = 1; k <= 3; k++) hit = M.blast(hit, BLOB(k), { select: M.bvhSelect(hit).select }).polys;
    const hitWhole = M.subtract(hit, far), hitLocal = M.subtractLocal(hit, far);
    ok("!! *** a blast FIFTY UNITS AWAY still re-cuts the whole wall, if you do not localise ***",
        farWhole.length > A.length && farLocal.polys.length === A.length &&
        hitWhole.length > hit.length * 1.2 && hitLocal.polys.length === hit.length,
        "a clean wall: " + A.length + " polygons -> " + farWhole.length + " whole-wall, " + farLocal.polys.length +
        " localised. A wall that has taken three hits: " + hit.length + " -> " + hitWhole.length +
        " whole-wall, " + hitLocal.polys.length + " localised. B's planes are INFINITE; clipTo does not care " +
        "that B is in another postcode. And note which way the RATIO goes: 2.2x on a clean wall, 1.25x on a " +
        "blasted one -- it is the ABSOLUTE waste that grows (7 polygons against 662), not the multiple, " +
        "because a wall already cut into small pieces has fewer of them left to split.");
    ok("!! ...and localised it is UNTOUCHED, to the bit, which whole-wall is not",
        M.volume(farLocal.polys) === M.volume(A) && M.volume(farWhole) !== M.volume(A),
        "localised " + M.volume(farLocal.polys).toFixed(15) + " === original; whole-wall " +
        M.volume(farWhole).toFixed(15) + ", off by " + Math.abs(M.volume(farWhole) - M.volume(A)).toExponential(2));
    const huge = M.boxPolys([0, 0, 0], [50, 50, 50]);
    ok("!! subtracting a solid that ENCLOSES A leaves nothing at all",
        Math.abs(M.volume(M.subtract(A, huge))) < 1e-9,
        "volume " + M.volume(M.subtract(A, huge)).toExponential(2) + ", polygons " + M.subtract(A, huge).length);
    ok("   and A - A is empty too", Math.abs(M.volume(M.subtract(A, A))) < 1e-9);
}

// =============================================================================================================
console.log("\n3. *** LOCALISATION: THE SAME SOLID, A DIFFERENT AND BETTER MESH ***");
{
    const A = WALL(), B = M.jaggedBlob([0, 0, 0], 1.0, 8, 12345);
    const whole = M.subtract(A, B);
    const loc = M.subtractLocal(A, B);
    ok("!! *** the two paths agree on the VOLUME to 1e-12 ***", Math.abs(M.volume(whole) - M.volume(loc.polys)) < 1e-12,
        "whole-wall " + M.volume(whole).toFixed(9) + ", localised " + M.volume(loc.polys).toFixed(9));
    ok("!! ...and DISAGREE on the polygon list, which is the point and must never be asserted away",
        whole.length !== loc.polys.length,
        "whole-wall " + whole.length + " polygons, localised " + loc.polys.length +
        " -- a gate that required these to match would be red on a correct optimisation");
    ok("   the untouched polygons are passed through, not re-cut",
        loc.skipped > 0 && loc.touched > 0, loc.touched + " touched, " + loc.skipped + " skipped");

    // *** MY FIRST VERSION OF THIS ASSERTED THAT THE BVH SET IS A SUPERSET OF THE PLAIN AABB SET, AND THAT IS
    // THE WRONG DIRECTION. *** Measured on a blasted wall: the BVH selects 2,377 polygons where the plain test
    // selects 2,378. It is TIGHTER, not looser, and correctly so -- the plain test bounds a whole polygon,
    // the BVH bounds each of its triangles, and a box can miss every triangle of a polygon whose corner-to-
    // corner box it clips. The superset claim passed only because the six-polygon wall has no such case, so
    // it was a check that could not fail rather than a check that held.
    //
    // The invariant that actually matters is not about sets at all: WHATEVER IS SELECTED, THE SOLID MUST COME
    // OUT THE SAME. That is asserted here on a wall complex enough for a selector to get it wrong, which is
    // where sabotaging either the AABB test or the BVH's box test now turns red and did not before.
    let rich = A;
    for (let k = 1; k <= 4; k++) rich = M.blast(rich, BLOB(k), { select: M.bvhSelect(rich).select }).polys;
    const rb = M.jaggedBlob([2.0, 1.0, 0], 0.9, 8, 999);
    const rWhole = M.subtract(rich, rb), rAABB = M.subtractLocal(rich, rb);
    const rBVH = M.subtractLocal(rich, rb, { select: M.bvhSelect(rich).select });
    ok("!! *** on a wall of " + rich.length + " polygons, all three selections give the SAME SOLID ***",
        Math.abs(M.volume(rWhole) - M.volume(rAABB.polys)) < 1e-9 &&
        Math.abs(M.volume(rWhole) - M.volume(rBVH.polys)) < 1e-9,
        "whole " + M.volume(rWhole).toFixed(9) + ", AABB-localised " + M.volume(rAABB.polys).toFixed(9) +
        ", BVH-localised " + M.volume(rBVH.polys).toFixed(9));
    ok("!! ...and the BVH never selects MORE than the polygon-box test, because it is tighter, not looser",
        rBVH.touched <= rAABB.touched,
        "BVH " + rBVH.touched + ", polygon-box " + rAABB.touched + " of " + rich.length + " -- equal at this " +
        "blast, and 2377 against 2378 on a twelve-blast wall. The BVH bounds each TRIANGLE, so it can rule " +
        "out a polygon whose corner-to-corner box the blast clips but whose triangles it all misses.");
    const { select } = M.bvhSelect(A);
    const bvhOut = M.subtractLocal(A, B, { select });
    ok("   and on the clean wall the two localisations still agree exactly",
        Math.abs(M.volume(bvhOut.polys) - M.volume(loc.polys)) < 1e-12,
        M.volume(bvhOut.polys).toFixed(9));

    // *** THE COPLANAR BUCKETS: TWO SOLIDS THAT SHARE A FACE. *** splitPolygon sorts a coplanar polygon by
    // whether it FACES the same way as the plane, and a union that put a back-facing one in the front bucket
    // keeps both copies of the shared face -- an interior wall inside a solid that is no longer a solid.
    const b1 = M.boxPolys([-1, 0, 0], [1, 1, 1]), b2 = M.boxPolys([1, 0, 0], [1, 1, 1]);
    const glued = M.union(b1, b2);
    ok("!! *** two boxes sharing a face union into ONE box: the shared face is eliminated, not kept twice ***",
        Math.abs(M.volume(glued) - 16) < 1e-9 && glued.length === 10 && M.watertight(glued).ok,
        "volume " + M.volume(glued).toFixed(9) + " of 16, " + glued.length + " polygons (6 + 6 - the two " +
        "coincident faces), watertight " + M.watertight(glued).ok + " -- keeping both copies leaves a wall " +
        "inside the solid and this is the check that sees it");

    // the BVH's new query, exercised on its own terms
    const bvh = new MeshBVH(Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 50, 50, 50, 51, 50, 50, 50, 51, 50]));
    ok("   trianglesInBox finds the near triangle and not the far one",
        JSON.stringify(bvh.trianglesInBox([-1, -1, -1], [2, 2, 2])) === "[0]" &&
        JSON.stringify(bvh.trianglesInBox([49, 49, 49], [52, 52, 52])) === "[1]" &&
        bvh.trianglesInBox([-1, -1, -1], [99, 99, 99]).length === 2 &&
        bvh.trianglesInBox([200, 200, 200], [201, 201, 201]).length === 0);
}

// =============================================================================================================
console.log("\n4. *** 'GAP-FREE' IS TWO DIFFERENT CLAIMS AND ONLY ONE OF THEM WAS TRUE ***");
{
    const A = WALL(), B = M.jaggedBlob([0, 0, 0], 1.0, 8, 12345);
    const raw = M.subtract(A, B);
    const c0 = edgeCensus(raw);
    ok("!! *** the raw boolean leaves a QUARTER of its edges without a partner ***",
        c0.tj > c0.edges * 0.15 && c0.tj < c0.edges * 0.4,
        c0.tj + " of " + c0.edges + " (" + (100 * c0.tj / c0.edges).toFixed(1) + "%) unmatched");
    ok("!! ...and NOT ONE of them is a gap -- every single one is covered from the other side",
        c0.gap === 0,
        "0 uncovered. So the surface really does bound the solid: the mesh is T-JUNCTIONED, not holed, and " +
        "the difference is the whole question. A T-junction leaks no volume and cracks a hairline of " +
        "background colour under a rasteriser, which neither the volume check nor a screenshot would show.");
    const settled = M.settle(raw);
    const c1 = edgeCensus(settled.polys);
    ok("!! *** ONE BLAST, SETTLED: 100.0% of edges matched, zero T-junctions, zero gaps ***",
        c1.matched === c1.edges, c1.matched + " of " + c1.edges + " matched, " + c1.tj + " T-junctions, " + c1.gap + " gaps");
    ok("   ...and settling did not move the solid", Math.abs(M.volume(settled.polys) - M.volume(raw)) < 1e-9,
        M.volume(settled.polys).toFixed(9) + " vs " + M.volume(raw).toFixed(9));
    ok("   ...nor make a polygon the fan triangulator cannot draw", M.allConvex(settled.polys).ok,
        JSON.stringify(M.allConvex(settled.polys)));
    report("merge took " + raw.length + " polygons to " + settled.polys.length + " and the weld put " +
           settled.stats.inserted + " vertices back");
}

// =============================================================================================================
console.log("\n5. *** TWELVE BLASTS: THREE REFUTED EXPLANATIONS, AND THE FOURTH, WHICH WAS EPS (ROUND 10) ***");
let TWELVE_CUT = null, TWELVE_SETTLED = null;   // shared with section 8; re-cutting them costs 1.1 s
{
    M.resetSplitStats();
    let wall = WALL(); const V0 = M.volume(wall);
    let cum = 0, worst = 0;
    for (let k = 1; k <= 12; k++) {
        const t0 = Date.now();
        wall = M.blast(wall, BLOB(k), { select: M.bvhSelect(wall).select }).polys;
        const ms = Date.now() - t0; cum += ms; if (ms > worst) worst = ms;
    }
    const cutStats = { cum, worst, polys: wall.length, vol: M.volume(wall) };
    report("cut phase: " + cum + " ms over twelve blasts, worst single blast " + worst + " ms, " + wall.length + " polygons");

    // the same twelve, whole-wall, for the comparison the round is built on
    let slow = WALL(); const t1 = Date.now();
    for (let k = 1; k <= 12; k++) slow = M.subtract(slow, BLOB(k));
    const slowMs = Date.now() - t1;
    ok("!! *** LOCALISING IS BOTH FASTER AND SMALLER, AND THE SECOND IS THE INTERESTING ONE ***",
        cutStats.cum * 2 < slowMs && wall.length < slow.length,
        "whole-wall " + slowMs + " ms / " + slow.length + " polygons, localised " + cum + " ms / " + wall.length +
        " -- the mesh is smaller because clipping through a BSP splits a polygon along planes it lies nowhere near");
    ok("!! ...and the two still describe THE SAME SOLID, which is the only thing that had to survive",
        Math.abs(M.volume(slow) - cutStats.vol) < 1e-6,
        "whole-wall " + M.volume(slow).toFixed(6) + ", localised " + cutStats.vol.toFixed(6) +
        " of an original " + V0.toFixed(6));

    // ---- HYPOTHESIS 1, REFUTED BY ITS OWN COUNTER --------------------------------------------------------
    ok("!! *** splitPolygon drops ZERO slivers in 12 blasts -- the first explanation, measured and dead ***",
        M.SPLIT_STATS.dropped === 0 && M.SPLIT_STATS.splits > 10000,
        M.SPLIT_STATS.dropped + " dropped of " + M.SPLIT_STATS.splits + " splits. A split that leaves fewer " +
        "than three vertices is discarded silently, and that WOULD accumulate into cracks. It does not happen here.");

    // ---- WHAT ACTUALLY SURVIVES, BOUNDED RATHER THAN EXPLAINED -------------------------------------------
    const settled = M.settle(wall);
    const c = edgeCensus(settled.polys);
    // *** ROUND 10 OF THE BVH-CSG ARC: THE CAUSE, FOUND, AND THIS CHECK TURNED ROUND. *** Until then it asserted
    // that cracks EXIST (15 of 12,847 at EPS=1e-5: gap > 0 and under 0.5%), "cause unknown", three explanations
    // refuted above and beside it. The fourth, measured on a copy with only EPS changed: 1e-5 -> 15, 1e-6, 1e-7,
    // 1e-8, 1e-9 -> 0 (meshCSG.mjs's EPS comment has the sweep). A vertex within EPS of a plane is rounded onto it,
    // and at 1e-5 that rounding left hairlines the weld could not sew. EPS is 1e-8 now (finer blobs than this
    // chain decided between 1e-6 and 1e-8 -- see that comment) and the gate says ZERO.
    ok("!! *** TWELVE BLASTS, SETTLED: ZERO UNCOVERED EDGES -- the 15 'cause unknown' cracks were EPS=1e-5 (round 10) ***",
        c.gap === 0 && c.edges > 10000,
        c.gap + " uncovered edges of " + c.edges + " (15 of 12,847 at EPS=1e-5; the census counts an unmatched edge " +
        "as a crack only if nothing covers it, so T-junctions are not in this number). Not sliver dropping (0), not " +
        "weld tolerance, not vertex spelling -- the three refuted above -- but the plane-classification EPS itself");
    ok("!! ...while the VOLUME is untouched by every one of snap, merge and weld",
        Math.abs(M.volume(settled.polys) - cutStats.vol) < 1e-6,
        "settled " + M.volume(settled.polys).toFixed(9) + " vs cut " + cutStats.vol.toFixed(9) +
        " -- so the solid is right and a hairline of its surface is not sewn");
    ok("   ...and settle still produces nothing concave", M.allConvex(settled.polys).ok,
        JSON.stringify(M.allConvex(settled.polys)));
    // Round 10b: the census above matches edges within 1e-9 and covers within 1e-7, and the weld now MOVES vertices
    // by up to 4.4e-9 on this wall -- a move made in one polygon and not its neighbour would pass both. So the
    // settled wall is also held to EXACT coordinates: every directed edge has its reverse, bit for bit. (A weld that
    // projected without moving the vertex elsewhere left 4,996 of 11,796 unmatched here and nothing else saw it.)
    {
        const E = new Map(), key = (v) => v[0] + "," + v[1] + "," + v[2];
        for (const p of settled.polys) for (let i = 0; i < p.vs.length; i++) {
            const a = key(p.vs[i]), b = key(p.vs[(i + 1) % p.vs.length]);
            if (a !== b) E.set(a + "|" + b, (E.get(a + "|" + b) || 0) + 1);
        }
        let un = 0;
        for (const [e, n] of E) { const [a, b] = e.split("|"); if (n !== 1 || (E.get(b + "|" + a) || 0) !== 1) un++; }
        ok("!! ...and it is watertight to the BIT: every directed edge has its exact reverse (round 10b)", un === 0 && E.size > 10000,
            un + " unmatched of " + E.size + " directed edges, exact coordinates");
    }
    ok("!! the coplanar merge is what pays for the polygon count",
        settled.polys.length < wall.length * 0.4,
        wall.length + " -> " + settled.polys.length + " polygons (" +
        (100 * (1 - settled.polys.length / wall.length)).toFixed(0) + "% off), " + settled.stats.merged + " merges");
    TWELVE_CUT = wall; TWELVE_SETTLED = settled.polys;
}

// =============================================================================================================
console.log("\n6. THE TWO PASSES THAT ARE ONLY SOUND WHERE THEY ARE PUT");
{
    // *** MERGING AN OPEN PATCH IS WRONG AND IT COST A MEASUREMENT TO FIND. *** blast() used to merge only the
    // freshly cut region, which is fast and which leaves 36 UNCOVERED edges, because mergeCoplanar's
    // shared-edge test assumes every edge has a partner and an open patch's boundary edges do not.
    const A = WALL(), B = M.jaggedBlob([0, 0, 0], 1.0, 8, 12345);
    const src = fs.readFileSync(path.join(ENG, "physics/mesh/meshCSG.mjs"), "utf8");
    const blastBody = src.slice(src.indexOf("export function blast("), src.indexOf("export function settle("));
    ok("!! *** blast() does NOT merge and does NOT weld -- both are settle()'s job ***",
        /if \(merge && false\)/.test(blastBody) && !/weldTJunctions/.test(blastBody),
        "welding every shot cost 5546 ms over twelve against 656 ms, and merging the cut PATCH (an open " +
        "surface) left 36 uncovered edges. Both are whole-mesh passes on a CLOSED mesh, once, when the " +
        "shooting stops.");
    const openPatch = M.subtractLocal(A, B).cut;
    ok("   ...and the cut region really is an OPEN surface, which is why merging it is unsound",
        !M.watertight(openPatch).ok && openPatch.length > 0,
        M.watertight(openPatch).unmatched + " unmatched edges in the patch, by construction");
    const m = M.mergeCoplanar(M.subtract(A, B));
    ok("!! mergeCoplanar on a CLOSED mesh conserves the volume exactly and stays convex",
        Math.abs(M.volume(m.polys) - M.volume(M.subtract(A, B))) < 1e-9 && M.allConvex(m.polys).ok,
        m.merged + " merges, " + M.subtract(A, B).length + " -> " + m.polys.length + " polygons");
    const w = M.weldTJunctions(m.polys);
    // Round 10b: the weld MOVES a vertex now -- onto the edge it is being inserted into, by at most its tolerance --
    // where round 10's EPS=1e-8 leaves a vertex a few 1e-9 off that edge's line (meshCSG.mjs, above weldTJunctions).
    // This row said "moves nothing"; it now says what moves and bounds it, and the volume still must not.
    ok("   weldTJunctions adds vertices, moves a vertex only onto an edge within its tolerance, and the volume does not move",
        Math.abs(M.volume(w.polys) - M.volume(m.polys)) < 1e-9 && w.inserted > 0 && w.maxMove <= 1e-7,
        w.inserted + " vertices inserted, " + w.moved + " moved (at most " + w.maxMove.toExponential(2) + "), volume " +
        M.volume(w.polys).toFixed(9));
}

// =============================================================================================================
console.log("\n7. WHAT THIS FILE IS NOT, WHICH IS HALF OF WHAT WAS ASKED FOR");
{
    const src = fs.readFileSync(path.join(ENG, "physics/mesh/meshCSG.mjs"), "utf8");
    const frac = fs.readFileSync(path.join(ENG, "physics/voxel/fracture.js"), "utf8");
    ok("!! *** 'gap-free RUBBLE and holes' is two problems and this file solves ONE of them ***",
        !/connectedComponents|floodFill/.test(src) && /connectedComponents/.test(frac),
        "a BSP subtraction returns ONE CONNECTED MESH WITH A HOLE IN IT. Rubble is pieces, and a piece needs " +
        "a mass, a centre of mass and an inertia tensor -- physics/voxel/fracture.js, which already holds a " +
        "voxel summation to the analytic box tensor. Not duplicated here, and the header says so.");
    ok("   ...and the SDF CSG next door is kept rather than replaced",
        fs.existsSync(path.join(ENG, "physics/mesh/csg.mjs")) && /SDF CSG NEXT DOOR/.test(src),
        "that path is exact in the field and then samples it on a grid, so a jagged rim is smoothed toward " +
        "the cell size. This one never samples anything. Neither replaces the other.");
    ok("!! the provenance is recorded: evanw/csg.js, MIT, method taken and code rewritten",
        /evanw\/csg\.js \(MIT\)/.test(src),
        "csg.js is a three.js-era CommonJS file with its own vector class; the tree has neither");
    ok("   the BVH's new query says why a third query exists rather than a third file",
        /THE THIRD QUERY/.test(fs.readFileSync(path.join(ENG, "mesh/meshBVH.mjs"), "utf8")));
}

// =============================================================================================================
console.log("\n8. *** THE FAN WAS SHIPPING TRIANGLES THAT COVER NOTHING, AND FOUR INSTRUMENTS HERE CANNOT SEE IT ***");
{
    // *** THIS SECTION EXISTS BECAUSE AN AUDIT AGAINST A FORMAL CSG PROPERTY LIST ASKED "NO DEGENERATE
    // TRIANGLES?" AND NOTHING IN THE MODULE OR THE GATE COULD ANSWER. *** The answer was 21.4%.
    const merged = M.mergeCoplanar(M.snapVertices(TWELVE_CUT, { tol: 1e-9 }).polys).polys;
    const pre = M.degenerateFan(merged), post = M.degenerateFan(TWELVE_SETTLED);
    ok("!! *** THE WELD MAKES THEM: ZERO DEGENERATE FAN TRIANGLES BEFORE IT, " + post.degenerate + " AFTER ***",
        pre.degenerate === 0 && post.degenerate > 0,
        pre.tris + " triangles before the weld with a flattest of " + pre.worstKept.toExponential(2) + ", " +
        post.tris + " after with " + post.degenerate + " (" + (100 * post.degenerate / post.tris).toFixed(1) +
        "%) at or under " + M.DEGENERATE_FLATNESS.toExponential(0) + ". weldTJunctions inserts a vertex into " +
        "every edge that has one lying on it, and an inserted vertex is COLLINEAR WITH THAT EDGE by " +
        "definition -- so wherever the fan's apex sits on the same straight run, the triangle has three " +
        "collinear corners. This is a comparison of two measurements rather than a constant: what makes it a " +
        "finding is the ZERO on the left.");
    ok("!! ...and the threshold is a reading of a MEASURED EMPTY BAND rather than a knob",
        post.bestDropped * 100 < post.worstKept &&
        M.degenerateFan(TWELVE_SETTLED, 1e-13).degenerate === post.degenerate &&
        M.degenerateFan(TWELVE_SETTLED, post.worstKept * 0.99).degenerate === post.degenerate,
        "largest dropped " + post.bestDropped.toExponential(2) + ", smallest kept " +
        post.worstKept.toExponential(2) + " -- a gap of " + (post.worstKept / post.bestDropped).toFixed(0) +
        "x with nothing in it, so every threshold across the whole band drops the same " + post.degenerate +
        " triangles. A constant chosen inside an empty band is a reading; the same constant chosen inside a " +
        "continuous distribution would be a guess, and this row is what tells the two apart.");
    // *** LOSSLESS IS ASSERTED ACROSS TWO INDEPENDENT CODE PATHS ON PURPOSE. *** surfaceArea() inlines its
    // own fan and never calls toTriangles(), so the instrument grading the drop is not the code that drops.
    const kept = M.toTriangles(TWELVE_SETTLED);
    const keptArea = kept.reduce((a, [x, y, z]) => a + area3(x, y, z), 0);
    ok("!! *** DROPPING THEM CHANGES THE SURFACE BY EXACTLY ZERO, TO THE LAST BIT ***",
        kept.length === post.tris - post.degenerate && keptArea === M.surfaceArea(TWELVE_SETTLED),
        kept.length + " triangles kept of " + post.tris + ", area " + keptArea.toFixed(12) + " against " +
        "surfaceArea()'s " + M.surfaceArea(TWELVE_SETTLED).toFixed(12) + " -- BIT-IDENTICAL, from two fans " +
        "written independently. The dropped ones carried " + post.area.toExponential(2) + " between them. The " +
        "T-junction the weld went in to sew is sewn by the vertex being ON THE BOUNDARY, which is a polygon " +
        "property; nothing about it ever needed a triangle of zero width to carry it.");
    ok("   ...and it reaches the buffer meshBVH is handed, not just the array",
        M.toTriangleBuffer(TWELVE_SETTLED).length === kept.length * 9,
        kept.length * 9 + " floats");
    // ---- WHY NOTHING CAUGHT THIS: each instrument is right for its own question and blind to this one ----
    const collinear = [{ vs: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], pl: { n: [0, 0, 1], w: 0 } }];
    const repeated  = [{ vs: [[0, 0, 0], [1, 0, 0], [0, 0, 0]], pl: { n: [0, 0, 1], w: 0 } }];
    // *** THIS ROW AND THE THREE UNDER IT ARE CHARACTERISATIONS OF THE INSTRUMENTS, NOT OF THE MESH, WHICH
    // MAKES THEIR RED MEAN THE OPPOSITE OF THE USUAL ONE. *** If someone gives allConvex() a degeneracy test
    // this goes red on GOOD news, and the right response is to update this section rather than to revert
    // them. Kept as assertions anyway, because the alternative is a comment claiming a blind spot that
    // nothing re-derives -- and the blind spot is the whole reason 21.4% of the buffer shipped unseen. It is
    // not idle: flipping allConvex's comparison to < eps reddens it AND reddens two long-standing rows in
    // sections 4 and 5, which is what says the "fix" is not free.
    ok("!! *** allConvex() CALLS A FULLY COLLINEAR POLYGON CONVEX, AND A REPEATED VERTEX TOO ***",
        M.allConvex(collinear).ok && M.allConvex(repeated).ok,
        "both {ok:true, reflex:0}. The test is dot(cross(v-u, w-v), n) < -eps and a collinear triple gives " +
        "EXACTLY ZERO, which is not less than -eps. That is correct for the question it asks -- is there a " +
        "reflex vertex -- and it is why the comment on toTriangles() saying the fan is 'valid because " +
        "allConvex() says so' was resting on an instrument that cannot see the failure it names.");
    ok("!! ...volume() and surfaceArea() weight each triangle BY ITS AREA, so a degenerate one is invisible",
        M.volume(collinear) === 0 && M.surfaceArea(collinear) === 0);
    ok("!! ...watertight() skips an edge whose endpoints quantise the same, by an explicit line",
        M.watertight(repeated).ok && /if \(a === b\) continue;/.test(fs.readFileSync(path.join(ENG, "physics/mesh/meshCSG.mjs"), "utf8")),
        "'a degenerate edge is not an edge' -- true, and it means a mesh made entirely of them reads closed");
    // *** MY FIRST DRAFT OF THIS ROW ASSERTED edgeCensus(repeated).edges === 0 AND WAS RED. *** A polygon
    // [p, q, p] has TWO edges of length 1 and one of length 0; only the last is dropped. What the census
    // actually does with a degenerate polygon is worse than ignoring it -- it reads it as a CLOSED SURFACE,
    // because p->q and q->p are a matched pair. The corrected row says that instead.
    const collapsed = [{ vs: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], pl: { n: [0, 0, 1], w: 0 } }];
    const cr2 = edgeCensus(repeated);
    ok("!! ...and this gate's OWN edgeCensus reads a degenerate polygon as a WATERTIGHT surface",
        edgeCensus(collapsed).edges === 0 && cr2.edges === 2 && cr2.matched === 2 && cr2.gap === 0,
        "a wholly collapsed polygon contributes 0 edges because every one is zero-length and dropped; a " +
        "[p,q,p] one contributes " + cr2.edges + ", " + cr2.matched + " of them MATCHED and " + cr2.gap +
        " uncovered -- a perfect score for a triangle with no area. So FOUR instruments -- three in the " +
        "module, one here -- each skip or mis-read degenerate geometry by construction, and between them " +
        "they read 21.4% of the shipped triangle buffer as clean. Every one is a PROXY that was standing " +
        "in for 'the mesh is fine'.");
}

// =============================================================================================================
console.log("\n9. *** THE DEGENERATE CONTACTS: EIGHT CASES A FORMAL PROPERTY LIST NAMES AND THIS GATE HAD NONE OF ***");
{
    // *** THE EXPECTED VOLUME IS DERIVED, NOT WRITTEN DOWN. *** Both operands are axis-aligned boxes, so the
    // overlap is a product of three interval lengths -- an oracle that shares no code with the BSP. A hand
    // -typed constant here would be checking my arithmetic, and my arithmetic was WRONG on the first draft of
    // this fixture: I read boxPolys's second argument as a full extent and predicted 28.8 for a cut that
    // removes 0.12. The module was right and the expectation was not.
    const overlap = (c1, h1, c2, h2) => {
        let v = 1;
        for (let i = 0; i < 3; i++) {
            const lo = Math.max(c1[i] - h1[i], c2[i] - h2[i]), hi = Math.min(c1[i] + h1[i], c2[i] + h2[i]);
            v *= Math.max(0, hi - lo);
        }
        return v;
    };
    const WC = [0, 0, 0], WH = [4, 3, 0.3];
    const cases = [
        ["a corner exactly on an edge",       [4.5, 0, 0.8],  [0.5, 0.4, 0.5]],
        ["an edge lying along an edge",       [4.5, 0, 0.8],  [0.5, 4.0, 0.5]],
        ["a face flush against a face",       [0, 0, 0.8],    [1.0, 1.0, 0.5]],
        ["...flush and hanging off the side", [4, 0, 0.8],    [1.0, 1.0, 0.5]],
        ["a through-cut, BOTH faces flush",   [0, 0, 0],      [1.0, 1.0, 0.3]],
        ["a cutter that swallows the wall",   [0, 0, 0],      [9.0, 9.0, 9.0]],
        ["a cutter that IS the wall",         [0, 0, 0],      [4.0, 3.0, 0.3]],
        ["a corner on a face interior",       [0, 0, 0.8],    [0.5, 0.5, 0.5]],
    ];
    const A = WALL(), VA = M.volume(A);
    let exact = 0, rawOpen = 0, sealed = 0, worstResid = 0;
    for (const [name, c, h] of cases) {
        const B = M.boxPolys(c, h), exp = overlap(WC, WH, c, h);
        const dif = M.subtract(A, B), int = M.intersect(A, B);
        const eDif = Math.abs(M.volume(dif) - (VA - exp)), eInt = Math.abs(M.volume(int) - exp);
        const resid = Math.abs(VA - M.volume(dif) - M.volume(int));
        if (eDif < 1e-12 && eInt < 1e-12) exact++;
        if (resid > worstResid) worstResid = resid;
        if (!M.watertight(dif).ok) rawOpen++;
        const s = M.settle(dif);
        if (M.watertight(s.polys).ok && Math.abs(M.volume(s.polys) - M.volume(dif)) < 1e-12) sealed++;
        report(name.padEnd(34) + " removes " + exp.toFixed(6) + ", got " + (VA - M.volume(dif)).toFixed(6) +
               ", raw watertight " + M.watertight(dif).ok + " -> settled " + M.watertight(s.polys).ok);
    }
    ok("!! *** ALL " + cases.length + " DEGENERATE CONTACTS GIVE THE EXACT VOLUME, AGAINST AN INDEPENDENT ORACLE ***",
        exact === cases.length,
        exact + " of " + cases.length + " to 1e-12, including the two that a BSP is supposed to find hardest: " +
        "a cutter IDENTICAL to the solid (every face coplanar with a face, both operators exact) and a " +
        "through-cut with both z faces flush. The BSP's COPLANAR bucket was never wrong; it was never tested.");
    ok("!! ...and the partition identity holds across every one of them",
        worstResid < 1e-12, "worst residual " + worstResid.toExponential(2));
    ok("!! *** " + rawOpen + " OF " + cases.length + " ARE NOT WATERTIGHT RAW, AND SETTLE CLOSES ALL " + cases.length + " ***",
        rawOpen > 0 && sealed === cases.length,
        rawOpen + " leave unmatched edges straight out of the boolean -- flush faces split each other and " +
        "leave T-junctions, exactly as one blast does -- and settle() takes all " + cases.length + " to zero " +
        "unmatched with the volume unmoved. That is the ONE-blast result reproduced on a fixture class the " +
        "twelve-blast wall never reaches, because a jagged blob never lands a face on a face.");
    // ---- MULTIPLICITY: an UNSIGNED instrument, where volume is a signed one -------------------------------
    // *** AND THE FIRST DRAFT OF THE ROW BELOW CLAIMED SOMETHING FALSE, WHICH IS WHY THE CLAIM IS NARROWED
    // HERE. *** I wrote that parity catches a shell counted twice with one copy inverted, because the volume
    // cancels. It does not: four crossings is still EVEN, and parity is blind to that exactly as volume is.
    // What parity actually adds is that it is UNSIGNED and LOCAL where volume is signed and global -- a
    // missing face and a face wound the wrong way both leave a ray crossing an odd number of times, while
    // their volume error can be arbitrarily small or cancel against another. At EPS=1e-5 that was the sharpest
    // available statement about the 15 uncovered edges: hairlines, not missing faces. Round 10 (EPS 1e-8) closed
    // them; the row stays because it still grades the multiplicity and still discriminates (the planted hole).
    const T = M.toTriangles(TWELVE_SETTLED);
    let rng = 12345; const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    let odd = 0, N = 100, crossings = 0;
    for (let i = 0; i < N; i++) {
        const o = [-9, -2.8 + rnd() * 5.6, -0.29 + rnd() * 0.58];
        const d = [1, (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02], L = Math.hypot(d[0], d[1], d[2]);
        const u = [d[0] / L, d[1] / L, d[2] / L];
        let n = 0;
        for (const [a, b, c] of T) {
            const e1 = sub(b, a), e2 = sub(c, a), pv = cross(u, e2), det = dot(e1, pv);
            if (Math.abs(det) < 1e-12) continue;
            const inv = 1 / det, tv = sub(o, a), bu = dot(tv, pv) * inv;
            if (bu < 0 || bu > 1) continue;
            const qv = cross(tv, e1), bvv = dot(u, qv) * inv;
            if (bvv < 0 || bu + bvv > 1) continue;
            if (dot(e2, qv) * inv > 1e-9) n++;
        }
        crossings += n;
        if (n % 2 === 1) odd++;
    }
    ok("!! *** THE TWELVE-BLAST SOLID IS BOUNDED WITH MULTIPLICITY ONE: " + (N - odd) + " OF " + N + " RAYS CROSS EVENLY ***",
        odd === 0,
        crossings + " crossings over " + N + " rays, " + odd + " odd. Worth having BESIDE the volume rather than " +
        "behind it because it is UNSIGNED and LOCAL: a dropped face or one wound the wrong way makes a ray " +
        "cross oddly however small its area, where the volume it costs can be a rounding error or can cancel " +
        "against another face entirely. NOT claimed: that this sees a doubled shell -- two copies is an even " +
        "number of crossings and parity is as blind to it as volume is. What it said at EPS=1e-5 was that the 15 " +
        "uncovered edges were hairlines rather than missing faces (round 10 closed them): " + (N - odd) + " of " + N + " rays across " +
        "the wall's whole cross-section cross evenly. (A face-sized hole, planted by making settle() drop one " +
        "polygon, reads 5 of 100 odd -- so the row discriminates rather than reporting a constant.)");
}

// =============================================================================================================
console.log("\n10. *** EPS (ROUND 10 OF THE BVH-CSG ARC): WHAT A PLANE TOLERANCE COSTS, ON EACH SIDE OF IT ***");
{
    // EPS went 1e-5 -> 1e-8 (meshCSG.mjs's EPS comment has the sweep). The risk named before the change was that a
    // tighter tolerance reopens near-degenerate contacts -- faces a hair apart that 1e-5 had called coplanar. So
    // section 9's eight contacts are SHIFTED here by d = 1e-9..2e-5, both signs, along each axis: 432 runs, the
    // same interval oracle. What EPS means, stated as the two checks it implies: a shift BEYOND EPS is cut
    // exactly; a shift WITHIN it is rounded flush, costing (contact area) x d and no more. The largest contact is
    // the wall's own top, 8 x 6 = 48.
    const overlap = (c1, h1, c2, h2) => {
        let v = 1;
        for (let i = 0; i < 3; i++) { const lo = Math.max(c1[i] - h1[i], c2[i] - h2[i]), hi = Math.min(c1[i] + h1[i], c2[i] + h2[i]); v *= Math.max(0, hi - lo); }
        return v;
    };
    const WC = [0, 0, 0], WH = [4, 3, 0.3], A = WALL(), VA = M.volume(A);
    const cases = [[[4.5, 0, 0.8], [0.5, 0.4, 0.5]], [[4.5, 0, 0.8], [0.5, 4.0, 0.5]], [[0, 0, 0.8], [1, 1, 0.5]], [[4, 0, 0.8], [1, 1, 0.5]],
                   [[0, 0, 0], [1, 1, 0.3]], [[0, 0, 0], [9, 9, 9]], [[0, 0, 0], [4, 3, 0.3]], [[0, 0, 0.8], [0.5, 0.5, 0.5]]];
    let beyond = 0, beyondN = 0, within = 0, withinN = 0, notExact = 0;
    for (const [c, h] of cases) for (const d of [1e-9, 1e-8, 1e-7, 5e-7, 1e-6, 2e-6, 5e-6, 1e-5, 2e-5]) for (const sg of [1, -1]) for (let ax = 0; ax < 3; ax++) {
        const c2 = c.slice(); c2[ax] += sg * d;
        const B = M.boxPolys(c2, h), exp = overlap(WC, WH, c2, h);
        const e = Math.max(Math.abs(M.volume(M.subtract(A, B)) - (VA - exp)), Math.abs(M.volume(M.intersect(A, B)) - exp));
        if (e > 1e-9) notExact++;
        if (d > M.EPS) { beyondN++; beyond = Math.max(beyond, e); } else { withinN++; within = Math.max(within, e / d); }
    }
    ok("!! *** A CONTACT SHIFTED BEYOND EPS IS CUT EXACTLY: " + beyondN + " runs to 1e-12 ***", beyond < 1e-12,
        "worst " + beyond.toExponential(2) + " (measured 4.3e-14). At EPS=1e-5 the shifts of 1e-8..1e-5 were still " +
        "inside the tolerance and rounded flush: cases off by more than 1e-9 went 80 -> 22 of 432 at 1e-8, none worse");
    ok("!! ...and one shifted WITHIN it costs at most (contact area) x d -- rounding flush, not breaking",
        // 48 is reached exactly (the wall's whole top rounded flush); at d = 1e-9 the volumes' own rounding (~4e-15 on
        // 28.8) is 4e-6 of the error, so the bound carries that, not slack.
        within <= 48 * (1 + 1e-5) && within > 1, "worst error / d = " + within.toFixed(6) + " over " + withinN +
        " runs (bound 48, the wall's top face; " + notExact + " of 432 runs off by more than 1e-9, all of them this)");

    // A cutter whose top face is TILTED by slope s about the line x = x0 on the wall's top face: it removes
    // 2.4 - |s| (1 + x0)^2 exactly (x, y in [-1,1]; z from -0.3 to min(0.3, 0.3 + s(x - x0))).
    const tilted = (s, x0) => M.boxPolys([0, 0, -0.2], [1, 1, 0.5]).map((p) => {
        const vs = p.vs.map((q) => (q[2] > 0.29 ? [q[0], q[1], 0.3 + s * (q[0] - x0)] : q));
        return { vs, pl: M.planeOf(vs) };
    });
    const tiltErr = (s, x0) => {
        const B = tilted(s, x0), exp = 2.4 - Math.abs(s) * (1 + x0) ** 2, dif = M.subtract(A, B);
        return { e: Math.max(Math.abs(M.volume(dif) - (VA - exp)), Math.abs(M.volume(M.intersect(A, B)) - exp)), open: !M.watertight(M.settle(dif).polys).ok };
    };
    // At EPS=1e-5 a tilt of exactly 1e-5 about the centre OPENED the wall: the cap between the two tops lost,
    // 0.2 of volume (a third of the missing cap's area times its height). At 1e-8 that geometry is exact.
    const t5 = [tiltErr(1e-5, 0), tiltErr(-1e-5, 0)];
    ok("!! a top face tilted by exactly 1e-5 -- 0.2 wrong and OPEN at EPS=1e-5 -- is exact and closed now",
        t5.every((r) => r.e < 1e-12 && !r.open), t5.map((r) => r.e.toExponential(2) + (r.open ? " OPEN" : "")).join(", "));

    // *** KNOWN, NOT FIXED BY ANY CONSTANT: TWO NEARLY PARALLEL FACES ~EPS APART. *** Each mesh measures the other
    // against its own plane. Tilt the cutter's top by s = 2e-8 about x0 = 0.5: its corner at x=1 sits s(1-x0) = 1e-8
    // above the wall's plane, and the wall's vertex there sits 1e-8 x cos(theta) below the cutter's. A few ulps
    // either way, one is FRONT and the other COPLANAR, each mesh calls the other's piece outside, and the cap between
    // them is dropped. At 1e-5 the band sat at s = 1e-5 (above); at 1e-6 near 2e-6 (36 of 201 slopes within 1e-10
    // relative); at 1e-8 here, 4 of 601 within 3e-7. Pinned by VOLUME only: at features this small meshCSG's
    // watertight() key (1e-6) merges vertices 1e-8 apart, and it reads "open" on exact results beside the band too.
    const band = tiltErr(2e-8 * (1 + 3e-9), 0.5), clear = tiltErr(2e-8 * (1 - 2e-9), 0.5);
    console.log("  KNOWN  two faces ~EPS apart, tilted 2e-8 about x0=0.5: error " + band.e.toExponential(3) +
        "; 5e-9 relative away the same fixture reads " + clear.e.toExponential(2) + " (its corner within EPS, rounded " +
        "flush: the ordinary cost) -- the boundary hazard EPS moves and narrows but does not remove");
    // Just below the band the corner at x=1 sits s(1-x0) = 1e-8 x (1 - 2e-9) above the wall's plane -- within EPS as
    // seen from BOTH meshes, so both call it coplanar, consistently, and it is rounded flush like any sub-EPS contact.
    ok("   ...pinned: inside the band the cap is lost (0.1); 5e-9 relative outside it, the sub-EPS bound holds",
        Math.abs(band.e - 0.1) < 1e-3 && clear.e < 48 * 2e-8,
        "inside " + band.e.toExponential(3) + ", outside " + clear.e.toExponential(2));
}

// =============================================================================================================
// SABOTAGE LOG, ROUND 10 -- each applied to the real meshCSG.mjs, this gate / meshBooleanBlast-selfcheck /
// meshBoolean-selfcheck run, file restored in a `finally` and md5 verified. Reds:
//   E1 EPS back to 1e-5              -> 3 / 4 / 0  (section 5's zero, the 1e-5 tilt, the band pin)
//   E2 EPS = 1e-6 (the arc's notes)  -> 1 / 1 / 0  (the band pin, incidental; meshBooleanBlast's subdiv-32 guard)
//   E3 EPS = 1e-7                    -> 1 / 0 / 0  (the band pin only, incidentally: NOTHING in a gate measures what
//                                                   separates 1e-7 from 1e-8 -- subdiv 128, ~13 s a run -- stated there)
//   E4 EPS = 1e-9                    -> 3 / 0 / 0  (section 5's zero, the weld's degenerate-fan count, the band pin:
//                                                   the noise floor meshCSG.mjs's EPS comment names, seen by this gate)
//   E5 EPS = 1e-10                   -> 4 / 0 / 0  (section 5, the weld's fan count, section 10's within-EPS bound, the band)
//   L1 whole-wall subtract() in place of the localisation -> 10 / 0 (both section-11 pins among them)
// meshBoolean-selfcheck goes 0 red on every one: it uses meshCSG.mjs for fixtures and a BSP oracle on boxes, where
// EPS does not bind. (An L1 that only bypassed the BVH `select` went 0/0/0 -- the fallback AABB test is the same
// partition -- and was replaced by the real substitution above.)
// SABOTAGE LOG, ROUND 10B -- each applied to the real meshCSG.mjs, this gate and meshBooleanBlast-selfcheck run,
// file restored in a `finally` and md5 verified. Reds here / there:
//   F1 the old early return when the patch is empty          -> 2 / 0  (the enclosed row, the seeded chains)
//   F2 the patch's verdict trusted, the solid never asked     -> 1 / 0  (the override row: it demands reclassified > 0)
//   F3 coplanar fragments classified by parity too            -> 1 / 0  (the flush row -- added for it: 0/0 at first)
//   F4 subtract()'s second clip dropped for coplanar ones     -> 1 / 0  (the flush row, likewise)
//   F5 B's self-split polygons classified (b.allPolygons())   -> 1 / 0  (the override row, incidentally: this costs
//                                                                        speed and polygons, not correctness)
//   F6 the weld inserts at the vertex's own position again    -> 3 / 0  (section 5's convexity, section 8's empty band
//                                                                        and its bit-identical area)
//   F7 the weld projects without moving the vertex elsewhere  -> 1 / 0  (section 5's exact census -- added for it: the
//                                                                        1e-9 census and 1e-7 coverage both passed it)
//   F8 parity trusted even when its five rays disagree        -> 0 / 0  NOT A MISSING CHECK, A PATH NO INPUT HAS TAKEN:
//                                                                        `ambiguous` read 0 in every run measured
// meshBooleanBlast-selfcheck is 0 on all of them: its BSP chain's volumes are right on either side of every one.
console.log("\n11. *** blast()'s LOCALISATION: FOUND AT ROUND 10, FIXED AT ROUND 10B -- B IS CLASSIFIED AGAINST THE WHOLE SOLID ***");
{
    // Round 10 found subtractLocal() keeping or dropping the BLOB's surface by a BSP of the near patch -- an open
    // surface -- not by the solid, and pinned it here as KNOWN. Round 10b splits B by the patch's planes as before
    // and classifies each fragment by ray parity against the WHOLE wall (meshPointClassify.mjs's pointInMesh, on
    // the BVH bvhSelect() already builds); meshCSG.mjs's subtractLocal() comment has the argument. Every row below
    // grades blast() against subtract() on the same inputs -- subtract() is exact, and agrees with meshBoolean's
    // arrangement to 1e-10 at 1x and 1000x.
    const HALF = [4, 3, 0.35], W = M.boxPolys([0, 0, 0], HALF);
    const sel = (w) => M.bvhSelect(w).select;
    // (1) destructible.html centres blasts on the mid-plane of a wall 0.7 thick: a radius-0.2 blob touches no face.
    // Round 10's blast() returned the wall unchanged, 20 of 20 shots at each radius 0.20..0.35.
    let exact1 = 0, cavity = 0;
    for (let k = 0; k < 5; k++) {
        const blob = M.jaggedBlob([k - 2, 0.5 * k - 1, 0], 0.2, 8, 500 + k, { rough: 0.6, floor: 0.4 });
        const vb = M.volume(M.blast(W, blob, { select: sel(W) }).polys), vs = M.volume(M.subtract(W, blob));
        if (Math.abs(vb - vs) < 1e-12) exact1++;
        cavity = Math.max(cavity, M.volume(W) - vs);
    }
    ok("!! *** A BLAST WHOLLY INSIDE THE WALL NOW CUTS ITS CAVITY: 5 of 5 equal to subtract() to 1e-12 ***",
        exact1 === 5 && cavity > 1e-3, exact1 + " of 5, cavities up to " + cavity.toExponential(2) + " (round 10: all 5 removed nothing)");
    // (2) the whole solid overriding the patch's verdict. Two states found by a seeded search for a second shot
    // that round 10's code got wrong while this code reclassifies at least one fragment; the pre-fix error on
    // these same states is recorded, measured with round 10's meshCSG.mjs: 2.3172e-3 and 1.5299e-2.
    const fixtures = [
        [{ c: [-2.937, -0.417, -0.208], r: 0.811, sub: 5, seed: 487946, rough: 0.696 }, { c: [-2.444, -0.347, 0.089], r: 0.967, sub: 4, seed: 24168, rough: 0.32 }],
        [{ c: [-2.034, 1.039, 0.05], r: 1.388, sub: 8, seed: 737758, rough: 0.712 }, { c: [-2.928, 0.157, 0.1], r: 0.62, sub: 6, seed: 121253, rough: 0.776 }],
    ];
    const blobOf = (t) => M.jaggedBlob(t.c, t.r, t.sub, t.seed, { rough: t.rough, floor: 1 - t.rough });
    const rows = fixtures.map(([t0, t1]) => {
        const w = M.blast(W, blobOf(t0), { select: sel(W) }).polys;
        const r = M.blast(w, blobOf(t1), { select: sel(w) });
        const exact = M.volume(M.subtract(M.subtract(W, blobOf(t0)), blobOf(t1)));
        return { err: M.volume(r.polys) - exact, recl: r.stats.reclassified, amb: r.stats.ambiguous, touched: r.stats.touched };
    });
    ok("!! *** AN OVERLAPPING SECOND BLAST IS EXACT, AND ONLY BECAUSE THE WHOLE SOLID OVERRODE THE PATCH ***",
        rows.every((r) => Math.abs(r.err) < 1e-12 && r.recl > 0 && r.touched > 0),
        rows.map((r) => "error " + r.err.toExponential(2) + ", " + r.recl + " fragments reclassified, " + r.touched + " polygons touched").join("; ") +
        " (round 10's code on these states: 2.3172e-3 and 1.5299e-2)");
    // (3) a seeded sample of the population the search drew from: two-shot chains over the page's slider range.
    // By hand at round 10b: 3,000 two-shot and 300 six-shot chains, 0 departures (worst 5.3e-13); and on 1,500
    // states built by this code, round 10's blast() was wrong on the next shot 82 times (up to 0.072), this one 0.
    let s = 7, worst = 0, off = 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let trial = 0; trial < 20; trial++) {
        let wl = M.boxPolys([0, 0, 0], HALF), ws = M.boxPolys([0, 0, 0], HALF);
        for (let k = 0; k < 2; k++) {
            const r = 0.2 + rnd() * 1.2, rough = 0.3 + rnd() * 0.6;
            const b = M.jaggedBlob([(rnd() * 2 - 1) * 3, (rnd() * 2 - 1) * 2, (rnd() * 2 - 1) * 0.3], r, 4 + Math.floor(rnd() * 5), Math.floor(rnd() * 1e6), { rough, floor: 1 - rough });
            wl = M.blast(wl, b, { select: sel(wl) }).polys; ws = M.subtract(ws, b);
        }
        const d = Math.abs(M.volume(wl) - M.volume(ws)); worst = Math.max(worst, d); if (d > 1e-11) off++;
    }
    ok("!! 20 seeded two-shot chains over the page's range: blast() equals subtract() on every one",
        off === 0, off + " off by more than 1e-11, worst " + worst.toExponential(2));
    // (4) FLUSH CONTACTS THROUGH blast(), where the fix keeps the patch's verdict (fragments that went coplanar) and
    // subtract()'s second clip on those alone. Added after sabotages that classified coplanar fragments by parity
    // (F3) or dropped that clip (F4) went 0 red here: nothing in this gate sent a flush contact through blast().
    // Measured: with either, 12 of 288 shifted contacts come out worse than subtract(), by up to 0.4, and flattened
    // blobs flush with the wall's top by 5.8e-2.
    const overlap = (c1, h1, c2, h2) => {
        let v = 1;
        for (let i = 0; i < 3; i++) { const lo = Math.max(c1[i] - h1[i], c2[i] - h2[i]), hi = Math.min(c1[i] + h1[i], c2[i] + h2[i]); v *= Math.max(0, hi - lo); }
        return v;
    };
    const WC = [0, 0, 0], WH = [4, 3, 0.3], A9 = M.boxPolys(WC, WH), VA9 = M.volume(A9);
    const contacts = [[[4.5, 0, 0.8], [0.5, 0.4, 0.5]], [[4.5, 0, 0.8], [0.5, 4.0, 0.5]], [[0, 0, 0.8], [1, 1, 0.5]], [[4, 0, 0.8], [1, 1, 0.5]],
                      [[0, 0, 0], [1, 1, 0.3]], [[0, 0, 0], [9, 9, 9]], [[0, 0, 0], [4, 3, 0.3]], [[0, 0, 0.8], [0.5, 0.5, 0.5]]];
    let worse = 0, runs = 0, worstC = 0;
    for (const [c, h] of contacts) for (const d of [0, 1e-9, 1e-7, 1e-5]) for (const sg of [1, -1]) for (let ax = 0; ax < 3; ax++) {
        const c2 = c.slice(); c2[ax] += sg * d;
        const B = M.boxPolys(c2, h), exp = VA9 - overlap(WC, WH, c2, h);
        const eb = Math.abs(M.volume(M.blast(A9, B, { select: sel(A9) }).polys) - exp), es = Math.abs(M.volume(M.subtract(A9, B)) - exp);
        runs++; worstC = Math.max(worstC, eb); if (eb > es + 1e-12) worse++;
    }
    let flush = 0;
    for (let k = 0; k < 6; k++) {
        const b = M.jaggedBlob([k - 2.5, 0.3 * k - 0.8, 0.3], 0.8, 6, 70 + k).map((p) => {
            const vs = p.vs.map((v) => [v[0], v[1], Math.min(v[2], 0.3)]);
            return { vs, pl: M.planeOf(vs) };
        }).filter((p) => Math.hypot(...p.pl.n) > 0.5);
        flush = Math.max(flush, Math.abs(M.volume(M.blast(A9, b, { select: sel(A9) }).polys) - M.volume(M.subtract(A9, b))));
    }
    ok("!! flush and near-flush contacts through blast(): never worse than subtract(), and flush-flattened blobs equal to it",
        worse === 0 && flush < 1e-12, runs + " shifted contacts, " + worse + " worse than subtract() (worst " + worstC.toExponential(2) +
        "); 6 blobs flattened flush with the top, worst |blast - subtract| " + flush.toExponential(2));
}

console.log("\n12. *** THE SKIN/CUT TAG OVER A CHAIN OF BLASTS (BVH-CSG ROUND 13) ***");
{
    // v4243's tag is checkable by construction -- a CUT face lies on a blob's plane, a SKIN face on the wall's --
    // and solidTexture-selfcheck checks it for ONE subtract. Over a chain it was wrong: subtract() and subtractLocal()
    // tagged A's side SKIN wholesale, so a face cut by one shot came back SKIN once the next shot came near it -- after
    // a second overlapping blast, 953 polygons with 3.85 units of area, all on the first blob's surface (the page's
    // radius-0.8 blasts). Both now keep a tag A's polygons already carry.
    const H = [4, 3, 0.35];
    const onPlane = (p, pl) => p.vs.every((v) => Math.abs(v[0] * pl.n[0] + v[1] * pl.n[1] + v[2] * pl.n[2] - pl.w) < 1e-7);
    const wallPlanes = M.boxPolys([0, 0, 0], H).map((p) => p.pl);
    const blobs = [M.jaggedBlob([0, 0, 0], 0.8, 8, 1), M.jaggedBlob([0.5, 0.2, 0], 0.8, 8, 2), M.jaggedBlob([0.3, -0.4, 0.1], 0.6, 8, 3),
                   M.jaggedBlob([-0.2, 0.3, 0], 0.7, 10, 4, { rough: 0.3, floor: 0.7 })];
    for (const [name, step] of [["blast()", (w, b) => M.blast(w, b, { select: M.bvhSelect(w).select }).polys], ["subtract()", (w, b) => M.subtract(w, b)]]) {
        let wall = M.boxPolys([0, 0, 0], H);
        const cutPlanes = [];
        let skinOff = 0, cutStray = 0, total = 0;
        for (const b of blobs) {
            wall = step(wall, b);
            for (const p of b) cutPlanes.push(p.pl);
        }
        for (const p of wall) {
            total++;
            if (p.src === M.SKIN && !wallPlanes.some((pl) => onPlane(p, pl))) skinOff++;
            if (p.src === M.CUT && (!cutPlanes.some((pl) => onPlane(p, pl)) || wallPlanes.some((pl) => onPlane(p, pl)))) cutStray++;
        }
        const tagged = wall.every((p) => p.src === M.SKIN || p.src === M.CUT);
        ok("!! " + name + ", four overlapping blasts: every SKIN polygon on the wall's own planes, every CUT one on a blob's and off the wall's",
            tagged && skinOff === 0 && cutStray === 0, total + " polygons: SKIN off the wall " + skinOff + ", CUT astray " + cutStray + ", all tagged " + tagged);
    }
    // ...and through settle(), which the page runs when the shooting stops and then lets it start again. snapVertices,
    // mergeCoplanar and weldTJunctions each built { vs, pl } and dropped the tag: one press of Settle left every
    // polygon untagged (6,226 of 6,226 on ten page blasts), and the next blast called all of it SKIN.
    {
        let wall = M.boxPolys([0, 0, 0], H);
        const cutPlanes = [];
        for (const b of blobs.slice(0, 2)) { wall = M.blast(wall, b, { select: M.bvhSelect(wall).select }).polys; for (const p of b) cutPlanes.push(p.pl); }
        const cutBefore = wall.filter((p) => p.src === M.CUT).length;
        const st = M.settle(wall).polys;
        const untagged = st.filter((p) => p.src !== M.SKIN && p.src !== M.CUT).length;
        for (const b of blobs.slice(2)) { wall = M.blast(st, b, { select: M.bvhSelect(st).select }).polys; for (const p of b) cutPlanes.push(p.pl); }
        let bad = 0;
        for (const p of wall) {
            if (p.src === M.SKIN ? !wallPlanes.some((pl) => onPlane(p, pl)) : p.src === M.CUT ? !cutPlanes.some((pl) => onPlane(p, pl)) : true) bad++;
        }
        ok("!! settle() keeps every tag (and merges only faces of one tag), and blasting on after it keeps the invariant",
            untagged === 0 && st.some((p) => p.src === M.CUT) && bad === 0,
            "after settle " + untagged + " untagged of " + st.length + " (" + cutBefore + " CUT before); after two more blasts " + bad + " astray of " + wall.length);
    }
    // mergeCoplanar's tag key, by hand. On a box wall under subtract, no CUT face can lie on a wall plane (the
    // coplanar rule drops the blob's copy there; blastEngine-selfcheck asserts it on 21 page chains), so the page never
    // offers it a SKIN and a CUT face to join -- the key is for any other polygon soup settle() is given. Here is one:
    // a box whose front face is two coplanar quads sharing an edge, the right-hand one CUT. Without the key they merge
    // into one polygon carrying the left one's tag, and the CUT area is gone.
    {
        const box = M.boxPolys([0, 0, 0], [1, 1, 1]);
        const front = box.find((p) => p.pl.n[2] > 0.5), rest = box.filter((p) => p !== front);
        const [x0, x1] = [-1, 1], y = [-1, 1], z = 1;
        const left = { vs: [[x0, y[0], z], [0, y[0], z], [0, y[1], z], [x0, y[1], z]], pl: front.pl, src: M.SKIN };
        const right = { vs: [[0, y[0], z], [x1, y[0], z], [x1, y[1], z], [0, y[1], z]], pl: front.pl, src: M.CUT };
        const area = (ps, tag) => ps.filter((p) => p.src === tag).reduce((a, p) => {
            let nx = 0, ny = 0, nz = 0;
            for (let i = 1; i + 1 < p.vs.length; i++) {
                const u = p.vs[i].map((c, k) => c - p.vs[0][k]), w = p.vs[i + 1].map((c, k) => c - p.vs[0][k]);
                nx += u[1] * w[2] - u[2] * w[1]; ny += u[2] * w[0] - u[0] * w[2]; nz += u[0] * w[1] - u[1] * w[0];
            }
            return a + Math.hypot(nx, ny, nz) / 2;
        }, 0);
        const st = M.settle([...rest.map((p) => ({ ...p, src: M.SKIN })), left, right]).polys;
        ok("!! settle() never merges a SKIN face with a CUT face on the same plane (by hand: a front face half CUT)",
            Math.abs(area(st, M.CUT) - 2) < 1e-12 && Math.abs(area(st, M.SKIN) - 22) < 1e-12,
            "CUT area " + area(st, M.CUT) + " (2 in), SKIN " + area(st, M.SKIN) + " (22 in), " + st.length + " polygons");
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether a blasted wall LOOKS like concrete -- it would take a rasterised A/B at a known " +
    "resolution to say, and nothing in this gate renders (the 0.1% of unsewn edges that question used to be about " +
    "is 0 since round 10). What IS checked: that A - B and A AND B tile A to 1e-13; that the localised path is the same " +
    "SOLID and a smaller MESH; that the BVH query is conservative in the only safe direction; that one blast " +
    "settles to 100.0% matched edges; and that twelve do too since round 10 of the BVH-CSG arc -- the 15 uncovered " +
    "edges were EPS=1e-5, three other proposed causes having been measured and refused first. " +
    "\nADDED BY THE v4542 AUDIT AGAINST A FORMAL CSG PROPERTY LIST: that the weld makes 1,637 of 7,665 fan " +
    "triangles that cover nothing and dropping them changes the surface by exactly zero; that four " +
    "instruments here read a degenerate polygon as clean, one of them scoring it a watertight surface; that " +
    "eight degenerate CONTACTS -- flush faces, a corner on an edge, a cutter identical to the solid -- are " +
    "all exact against an interval oracle and settle to watertight; and that 100 rays cross the twelve-blast " +
    "solid evenly (which, at EPS=1e-5, said the 15 uncovered edges were hairlines rather than missing faces). " +
    "\nADDED AT ROUND 10 OF THE BVH-CSG ARC: EPS 1e-5 -> 1e-8, near-flush contacts shifted either side of it (exact " +
    "beyond, at most area x d within, none worse than before) and the tilted-face boundary band pinned as KNOWN " +
    "(section 10); and blast()'s localisation found classifying the blob against an open patch -- a blast wholly " +
    "inside the wall removed nothing, a chained one departed from subtract() -- FIXED at round 10b by classifying B's " +
    "fragments against the whole solid, and graded against subtract() (section 11); the weld, which EPS=1e-8 had " +
    "made dent polygons by a few 1e-9, now projects what it inserts (sections 5 and 6). STILL " +
    "UNCHECKED by that audit: self-intersection away from shared edges, which needs a pairwise triangle test " +
    "this gate does not have, and doubled shells, which neither the volume nor the parity can see.");
process.exit(fails ? 1 : 0);
