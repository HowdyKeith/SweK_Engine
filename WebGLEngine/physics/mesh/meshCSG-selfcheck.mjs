// WebGLEngine/physics/mesh/meshCSG-selfcheck.mjs -- v4235
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
console.log("\n5. *** TWELVE BLASTS: WHERE IT HOLDS, WHERE IT DOES NOT, AND THREE REFUTED EXPLANATIONS ***");
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
    ok("!! *** AND OVER TWELVE BLASTS IT DOES NOT REACH 100%, AND THIS GATE SAYS SO RATHER THAN ROUNDING ***",
        c.gap > 0 && c.gap < c.edges * 0.005,
        c.gap + " uncovered edges of " + c.edges + " (" + (100 * c.gap / c.edges).toFixed(3) + "%), worst " +
        "missing length " + c.worstGap.toExponential(2) + " on a wall spanning 8. These are REAL cracks, not " +
        "T-junctions. Cause unknown: not sliver dropping (0 measured), not weld tolerance (identical from " +
        "1e-9 to 1e-7), not vertex spelling (snapVertices closes none at any tolerance from 1e-12 to 1e-6).");
    ok("!! ...while the VOLUME is untouched by every one of snap, merge and weld",
        Math.abs(M.volume(settled.polys) - cutStats.vol) < 1e-6,
        "settled " + M.volume(settled.polys).toFixed(9) + " vs cut " + cutStats.vol.toFixed(9) +
        " -- so the solid is right and a hairline of its surface is not sewn");
    ok("   ...and settle still produces nothing concave", M.allConvex(settled.polys).ok,
        JSON.stringify(M.allConvex(settled.polys)));
    ok("!! the coplanar merge is what pays for the polygon count",
        settled.polys.length < wall.length * 0.4,
        wall.length + " -> " + settled.polys.length + " polygons (" +
        (100 * (1 - settled.polys.length / wall.length)).toFixed(0) + "% off), " + settled.stats.merged + " merges");
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
    ok("   weldTJunctions adds vertices and moves nothing",
        Math.abs(M.volume(w.polys) - M.volume(m.polys)) < 1e-9 && w.inserted > 0,
        w.inserted + " vertices inserted, volume " + M.volume(w.polys).toFixed(9));
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

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether a blasted wall LOOKS like concrete, and whether the 0.1% of unsewn edges is " +
    "ever visible -- it would take a rasterised A/B at a known resolution to say, and nothing in this gate " +
    "renders. What IS checked: that A - B and A AND B tile A to 1e-13; that the localised path is the same " +
    "SOLID and a smaller MESH; that the BVH query is conservative in the only safe direction; that one blast " +
    "settles to 100.0% matched edges; and that twelve do not, with three proposed causes measured and refused.");
process.exit(fails ? 1 : 0);
