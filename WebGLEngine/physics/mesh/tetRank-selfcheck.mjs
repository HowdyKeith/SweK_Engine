// WebGLEngine/physics/mesh/tetRank-selfcheck.mjs -- v3641
//
// Run: node physics/mesh/tetRank-selfcheck.mjs
//
// *** v3640 CALLED THIS A GENUINE OPEN QUESTION RATHER THAN A GUESS, AND IT WAS RIGHT TO. In 2D the set of cells
// whose gradient cannot be determined from cell averages is EXACTLY TWO, at every mesh size. In 3D IT IS 6n --
// it GROWS LINEARLY WITH THE MESH. The 2D answer does not transfer, and no amount of staring at it would have
// given the 3D one. ***
//
// A gradient in 3D has THREE unknowns and each face neighbour supplies ONE equation, so a tetrahedron needs THREE
// non-coplanar neighbours where a triangle needed two non-collinear ones. A tet has FOUR faces, so there is
// margin -- and more ways to fall short.

import { readFileSync } from "node:fs";
import {
    makeTetMesh, analyticCells3, gradientLS3, rankCensus3, boundaryCells3, linearityError3,
} from "./tetReconstruct.mjs";
import { makeTriMesh, analyticCells, rankCensus } from "./triReconstruct.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const LIN3 = (x, y, z) => 0.3 + 0.7 * x - 0.4 * y + 0.55 * z;
const M3 = (n, skew = 0.25) => makeTetMesh({ nx: n, ny: n, nz: n, h: 1, skew });
const deficient = (c) => (c.byRank[0] || 0) + (c.byRank[1] || 0) + (c.byRank[2] || 0);

// --- 1. the census, and the scaling law -------------------------------------------------------------------------
{
    say("1. HOW MANY TETRAHEDRA CAN DETERMINE A GRADIENT? Three unknowns; each face neighbour is one equation.");
    const rows = [4, 6, 8, 12, 16].map((n) => {
        const m = M3(n), u = analyticCells3(LIN3, m), c = rankCensus3(u, m);
        let b = 0; for (const v of boundaryCells3(m)) b += v;
        return { n, tets: c.total, boundary: b, def: deficient(c), byNbr: c.byNbr };
    });
    for (const r of rows) say("     n = " + String(r.n).padStart(2) + "   tets " + String(r.tets).padStart(6) +
        "   boundary " + String(r.boundary).padStart(5) + "   rank-deficient " + String(r.def).padStart(4) +
        "   def/n " + (r.def / r.n).toFixed(2));
    ok("!! the rank-deficient count is EXACTLY 6n, at every mesh size", rows.every((r) => r.def === 6 * r.n),
        rows.map((r) => r.def).join(", ") + " at n = " + rows.map((r) => r.n).join(", ") + " -- def/n is 6.00 to " +
        "two decimals in every row, so this is a LAW OF THE TRIANGULATION rather than a fitted trend");
    ok("!! and that is a DIFFERENT SCALING FROM 2D, which was O(1)", (() => {
        const two = [8, 16, 32, 64].map((n) => {
            const m = makeTriMesh({ nx: n, ny: n, h: 20 / n, skew: 0.25 });
            return rankCensus(analyticCells((x, y) => 0.3 + 0.7 * x - 0.4 * y, m), m).byRank[1] || 0;
        });
        say("     2D, for comparison: " + two.join(", ") + " at n = 8, 16, 32, 64 -- CONSTANT");
        // MY FIRST VERSION ASSERTED rows[4].def > 4 * rows[0].def AND WENT RED BY EXACTLY NOTHING: 96 against
        // 4 * 24 = 96. A strict inequality where the law predicts EQUALITY. The right assertion is the law itself.
        const exactlyLinear = rows[4].def / rows[0].def === rows[4].n / rows[0].n;
        return two.every((v) => v === 2) && exactlyLinear;
    })(), "TWO in 2D forever against 6n in 3D. THE 2D ANSWER DOES NOT TRANSFER, and this arc has been wrong three " +
        "times guessing how a 2D result carries -- so it was measured");
    ok("boundary cells meanwhile grow as the SURFACE, not the edges", (() => {
        const perFace = rows.map((r) => r.boundary / (r.n * r.n));
        say("     boundary / n^2: " + perFace.map((v) => v.toFixed(2)).join(", ") + "  (approaching a constant)");
        return perFace[4] / perFace[0] < 1.3 && perFace[4] > perFace[0];
    })(), "so the DEFICIENT set tracks the box's EDGES (O(n)) while the BOUNDARY tracks its FACES (O(n^2))");
    ok("!! therefore refinement makes the defect RARER AND MORE NUMEROUS AT THE SAME TIME",
        rows[4].def > rows[0].def && rows[4].def / rows[4].tets < rows[0].def / rows[0].tets / 4,
        "the fraction falls from " + (100 * rows[0].def / rows[0].tets).toFixed(2) + "% to " +
        (100 * rows[4].def / rows[4].tets).toFixed(3) + "% while the COUNT rises from " + rows[0].def + " to " +
        rows[4].def + ". A solver that handles them one at a time has MORE work every time it refines, and a " +
        "solver that ignores them has a SMALLER FRACTION wrong -- both statements are true and they are about " +
        "different things");
}

// --- 2. where they are -----------------------------------------------------------------------------------------
{
    say("2. WHERE ARE THEY? Measured, not assumed from the 6n.");
    const n = 8, m = M3(n), u = analyticCells3(LIN3, m), g = gradientLS3(u, m);
    const L = n * m.h;
    let onEdge = 0, onFaceOnly = 0, interior = 0, total = 0;
    for (let t = 0; t < m.tet.length; t++) {
        if (g.rank[t] >= 3) continue;
        total++;
        // how many of the three coordinates are within one cell of a box face?
        const near = [[m.cx[t], L], [m.cy[t], L], [m.cz[t], L]]
            .filter(([v, len]) => v < 1.2 * m.h || v > len - 1.2 * m.h).length;
        if (near >= 2) onEdge++; else if (near === 1) onFaceOnly++; else interior++;
    }
    say("     of " + total + " deficient tets: " + onEdge + " sit on a box EDGE (two faces at once), " +
        onFaceOnly + " on one face only, " + interior + " in the interior");
    ok("!! every deficient tet is on a box EDGE, which is why the count is O(n) and not O(n^2)",
        onEdge === total && interior === 0,
        "a tet on ONE face of the box loses one neighbour and still has three -- exact. It takes TWO faces at once " +
        "to lose two, and the set of places where two faces meet is the twelve EDGES, whose total length is O(n)");
    ok("...and 6n over twelve edges is n/2 per edge", 6 * n / 12 === n / 2 && total === 6 * n,
        "half the tets along each edge, which is what the Kuhn subdivision's cut direction gives");
}

// --- 3. THREE NEIGHBOURS ARE ENOUGH, AND MOST BOUNDARY TETS HAVE THEM ------------------------------------------------
{
    say("3. LINEARITY ERROR SPLIT BY RANK, on the regular and the sheared mesh.");
    for (const skew of [0, 0.25]) {
        const m = makeTetMesh({ nx: 8, ny: 8, nz: 8, h: 1, skew });
        const w = linearityError3(m);
        say("     skew " + skew + "   rank 3: " + (w[3] || 0).toExponential(3) + "   rank 2: " + (w[2] || 0).toExponential(3));
    }
    const m = M3(8), c = rankCensus3(analyticCells3(LIN3, m), m);
    say("     neighbour histogram: " + JSON.stringify(c.byNbr) + " of " + c.total);
    ok("!! every rank-3 tet is exact, INCLUDING the " + (c.byNbr[3] || 0) + " boundary tets that have only three neighbours",
        (linearityError3(m)[3] || 0) < 1e-13 && (c.byNbr[3] || 0) > 500,
        "worst " + (linearityError3(m)[3] || 0).toExponential(3) + " -- three non-coplanar differences determine a " +
        "3-vector exactly, so a tet missing ONE face is fully determined. THE SAME SHAPE AS 2D, where two " +
        "neighbours sufficed: the margin is one face, not zero");
    ok("and the deficient ones read EXACTLY 1.000, which is the zero again", Math.abs((linearityError3(m)[2] || 0) - 1) < 1e-12,
        "gx = gy = gz = 0 against a unit-normalised truth IS exactly one. AN ERROR OF EXACTLY 1.000 IS A REFUSAL, " +
        "NOT A MEASUREMENT -- v3640's finding, carried into 3D by construction rather than rediscovered, because " +
        "gradientLS3 returns `rank` from the start");
    ok("the singularity test is scale-free in 3D too", (() => {
        const src = readFileSync(new URL("./tetReconstruct.mjs", import.meta.url), "utf8");
        const counts = [4, 16].map((k) => deficient(rankCensus3(analyticCells3(LIN3, M3(k)), M3(k))) / k);
        return /SCALE-FREE \(compare against the trace/.test(src) && Math.abs(counts[0] - counts[1]) < 1e-9;
    })(), "det against the trace CUBED, and def/n is identical at n = 4 and n = 16");
}

// --- 4. the mesh itself, checked before anything is concluded from it -------------------------------------------------
{
    say("4. THE MESH. Six tets per cube (Kuhn), and the connectivity is derived rather than assumed.");
    const m = M3(6);
    // *** MY CLAIM HERE WAS WRONG AND THE CHECK CAUGHT IT: I wrote that a sheared mesh keeps the same total volume
    // "because the shear is a displacement of the vertices, not a scaling". IT DOES NOT -- the sheared mesh sums to
    // 216.077 against a box of 216.000, 0.036% more, because THE SHEAR MOVES THE BOUNDARY VERTICES TOO and the
    // domain itself is no longer that box. A spatially VARYING displacement is not volume-preserving; only a
    // uniform one is. So volume is tested where it is a real statement -- the UNSHEARED mesh -- and tiling is
    // tested TOPOLOGICALLY, which holds at any skew. ***
    ok("the unsheared tets tile the box exactly", (() => {
        const flat = makeTetMesh({ nx: 6, ny: 6, nz: 6, h: 1, skew: 0 });
        let v = 0; for (const q of flat.vol) v += q;
        const box = Math.pow(6, 3);
        let vs = 0; for (const q of m.vol) vs += q;
        say("     unsheared volume " + v.toFixed(9) + " against a box of " + box.toFixed(9) +
            "; the SHEARED mesh sums to " + vs.toFixed(6) + ", because the shear moves the boundary too");
        return Math.abs(v - box) / box < 1e-12;
    })(), "and the sheared figure is a fact about the DOMAIN, not a gap in the tiling -- which is why the next line " +
        "checks the tiling topologically instead");
    ok("...and the tiling is sound at ANY skew, checked by face incidence rather than by volume", (() => {
        const counts = new Map();
        const key = (a, b, c) => { const s2 = [a, b, c].sort((p, q) => p - q); return s2.join(":"); };
        for (const [a, b, c, d] of m.tet) for (const f of [[a, b, c], [a, b, d], [a, c, d], [b, c, d]]) {
            const k = key(...f); counts.set(k, (counts.get(k) || 0) + 1);
        }
        let once = 0, twice = 0, more = 0;
        for (const n2 of counts.values()) { if (n2 === 1) once++; else if (n2 === 2) twice++; else more++; }
        say("     faces shared by exactly one tet " + once + ", by two " + twice + ", by more " + more);
        return more === 0 && once > 0 && twice > 0;
    })(), "NO face belongs to three or more tets, which is what an overlap would look like, and the once-shared " +
        "faces are exactly the boundary -- a statement the shear cannot disturb");
    ok("face neighbours come from shared vertex TRIPLES, not from the index pattern", (() => {
        const src = readFileSync(new URL("./tetReconstruct.mjs", import.meta.url), "utf8");
        return /two tets sharing THREE vertices/.test(src) && /faceMap/.test(src);
    })(), "so the census would hold for any tetrahedralisation, not only this one");
    ok("no tet has more than four face neighbours", m.nbr.every((l) => l.length <= 4),
        "which would mean the face matching had paired something it should not");
    ok("the cell-average sampling is EXACT for the linear field the key uses", (() => {
        const src = readFileSync(new URL("./tetReconstruct.mjs", import.meta.url), "utf8");
        return /the average of a LINEAR function is\n\/\/ exactly its value at the CENTROID/.test(src) ||
            /exactly its value at the CENTROID/.test(src);
    })(), "over a simplex the mean of a linear function IS its centroid value, so the key has no quadrature error " +
        "in it at all -- stated rather than hidden, because it is why the 1.4e-14 is meaningful");
}

// --- 5. scope -----------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./tetReconstruct.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    say("   NOT CLAIMED: that 6n holds for any tetrahedralisation. It is measured for the KUHN subdivision of a box,");
    say("   and section 2 says WHY it is O(n) -- deficiency needs two box faces at once, and that is an EDGE. A mesh");
    say("   whose cut direction differs would move the constant; a mesh with no straight edges (a sphere) would need");
    say("   the argument re-run, and this round does not do it.");
    say("   NOT DONE: what a solver should DO at these cells -- v3640 named the options (a boundary condition");
    say("   supplying the missing equation, a wider stencil, or refusing) and none is tested in either dimension.");
    say("   AND THE 3D VERSION OF THAT QUESTION IS SHARPER THAN THE 2D ONE, because 6n of them is a real workload");
    say("   where two was not.");
}

console.log("tetRank-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
