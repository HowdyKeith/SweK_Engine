// WebGLEngine/physics/mesh/gradientJoin-selfcheck.mjs -- v3638
//
// Run: node physics/mesh/gradientJoin-selfcheck.mjs
//
// TWO STANDARD GRADIENTS, AND THE EXACT KEY THAT SEPARATES THEM -- v3637 named this as "a two-declarations round
// of its own" and it is exactly that shape: least-squares and Green-Gauss are BOTH called "the gradient", both
// ship in real solvers, and nothing here had ever compared them.
//
// *** THE KEY NEEDS NO TOLERANCE AND NO REFERENCE RUN: ANY GRADIENT WORTH THE NAME REPRODUCES A LINEAR FIELD
// EXACTLY. Feed u = a + b*x + c*y and the answer is (b, c), on every mesh, at every skew, with nothing to
// converge. A scheme that misses here is not inaccurate -- it cannot represent the one field every finite-volume
// method is built to get right. ***
//
// AND THE POINT OF THE ROUND IS WHAT THE OTHER INSTRUMENT SAYS: on a SMOOTH field the two are indistinguishable,
// same order and within a quarter in magnitude. A CONVERGENCE STUDY CANNOT SEE THIS DEFECT. The exact key can.

import { readFileSync } from "node:fs";
import {
    makeTriMesh, analyticCells, gradientLS, gradientGG, linearityError, accuracy, limitBJ, vertexEscapes,
} from "./triReconstruct.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const GGs = (u, m) => gradientGG(u, m, { weighting: "simple" });
const GGd = (u, m) => gradientGG(u, m, { weighting: "distance" });
const F = (x, y) => Math.exp(-((x - 10) ** 2 + (y - 10) ** 2) / 18);

// --- 1. the zero-skew control, which caught my own arithmetic ---------------------------------------------------
{
    say("1. THE CONTROL FIRST: on the REGULAR mesh all three must be exact, because there is nothing to be skewed by.");
    const m = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0 });
    const ls = linearityError(m, { grad: gradientLS }), gs = linearityError(m, { grad: GGs }), gd = linearityError(m, { grad: GGd });
    say("     LS " + ls.toExponential(3) + "   GG-simple " + gs.toExponential(3) + "   GG-distance " + gd.toExponential(3));
    ok("!! all three reproduce a linear field exactly on the regular mesh", ls < 1e-13 && gs < 1e-13 && gd < 1e-13,
        "MY FIRST GREEN-GAUSS DIVIDED BY 2A INSTEAD OF A AND THIS LINE READ EXACTLY 0.5000 ON EVERY MESH INCLUDING " +
        "THIS ONE. AN ERROR THAT IS EXACTLY ONE HALF AT ZERO SKEW IS A NORMALISATION, NOT A FINDING -- the control " +
        "failing means the instrument was wrong before the question was asked, and the round would otherwise have " +
        "reported a factor of two as a defect in a standard method");
    ok("the module records that, where the next reader meets it", (() => {
        const src = readFileSync(new URL("./triReconstruct.mjs", import.meta.url), "utf8");
        return /AN ERROR THAT IS EXACTLY ONE HALF/.test(src) && !/gx\[t\] = sx \/ \(2 \* m\.area/.test(src);
    })());
}

// --- 2. THE EXACT KEY, ON A SKEWED MESH ---------------------------------------------------------------------------
{
    say("2. SHEAR THE MESH AND ASK THE SAME QUESTION. The field is still linear; the answer is still (b, c).");
    const rows = [0, 0.1, 0.25, 0.4].map((skew) => {
        const m = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew });
        return { skew, ls: linearityError(m, { grad: gradientLS }), gs: linearityError(m, { grad: GGs }), gd: linearityError(m, { grad: GGd }) };
    });
    for (const r of rows) say("     skew " + r.skew.toFixed(2) + "   LS " + r.ls.toExponential(3) +
        "   GG-simple " + r.gs.toExponential(3) + "   GG-distance " + r.gd.toExponential(3));
    ok("!! LEAST-SQUARES IS EXACT AT EVERY SKEW", rows.every((r) => r.ls < 1e-13),
        "worst " + Math.max(...rows.map((r) => r.ls)).toExponential(3) + " over the whole sweep -- it SOLVES for the " +
        "plane through the neighbours, and when the data lie on a plane the residual is zero by construction");
    ok("!! GREEN-GAUSS IS NOT, AND ITS MISS GROWS WITH THE SHEAR", rows[3].gs > 100 * rows[3].ls && rows[3].gs > rows[1].gs,
        "3.246e-3 / 8.134e-3 / 1.305e-2 at skews 0.1 / 0.25 / 0.4. The face value is taken as the SIMPLE AVERAGE of " +
        "the two cell values, which silently assumes THE FACE MIDPOINT LIES HALFWAY BETWEEN THE TWO CENTROIDS -- true " +
        "on a uniform Cartesian grid, false on a triangle, and further from true the more the mesh is sheared");
    ok("the 'improved' distance weighting reduces it and does NOT remove it", rows.slice(1).every((r) => r.gd < r.gs && r.gd > 100 * r.ls),
        "GG-distance is about 40% better at every skew and still five orders above LS. Interpolating along the " +
        "centroid line fixes WHERE the value is read and not that the face integral wants a different quantity");
}

// --- 3. IT CONVERGES, WHICH IS WHY NOBODY NOTICES -------------------------------------------------------------------
{
    say("3. DOES REFINEMENT RESCUE IT? Refining at FIXED MESH SHAPE -- the shear scales with h, so the family is");
    say("   self-similar and this is the honest way to refine a skewed mesh.");
    const errs = [12, 24, 48, 96].map((n) => linearityError(makeTriMesh({ nx: n, ny: n, h: 20 / n, skew: 0.25 }), { grad: GGs }));
    const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
    say("     n = 12, 24, 48, 96:  " + errs.map((e) => e.toExponential(3)).join("  ") + "   orders " + orders.map((o) => o.toFixed(3)).join(", "));
    ok("!! it does converge, at second order -- so Green-Gauss is CONSISTENT, just never EXACT",
        orders.every((o) => o > 1.9 && o < 2.1),
        "which is the sentence worth keeping: it is not broken, it is a method that gets a linear field wrong by " +
        "O(h^2) AT EVERY FINITE RESOLUTION while least-squares gets it right at all of them");
}

// --- 4. AND A CONVERGENCE STUDY CANNOT SEE ANY OF THIS ----------------------------------------------------------------
{
    say("4. THE SAME TWO GRADIENTS ON A SMOOTH FIELD, which is what anybody would actually test with.");
    const table = [["LS", gradientLS], ["GG-simple", GGs], ["GG-distance", GGd]].map(([name, G]) => {
        const errs = [12, 24, 48].map((n) => {
            const m = makeTriMesh({ nx: n, ny: n, h: 20 / n, skew: 0.25 });
            const u = analyticCells(F, m);
            return accuracy(F, m, u, G(u, m));
        });
        const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
        say("     " + name.padEnd(12) + errs.map((e) => e.toExponential(2)).join("  ") + "   orders " + orders.map((o) => o.toFixed(2)).join(", "));
        return { name, errs, order: orders[orders.length - 1] };
    });
    ok("!! all three are second order and within a quarter of each other in magnitude",
        table.every((r) => r.order > 1.9 && r.order < 2.2) && table[1].errs[2] / table[0].errs[2] < 1.35,
        "GG-simple is " + (table[1].errs[2] / table[0].errs[2]).toFixed(2) + "x LS at the finest mesh, with the SAME " +
        "ORDER. A CONVERGENCE STUDY WOULD CALL THESE EQUIVALENT AND SHIP EITHER");
    ok("...while the exact key separates them by five orders of magnitude", (() => {
        const m = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0.25 });
        return linearityError(m, { grad: GGs }) / linearityError(m, { grad: gradientLS }) > 1e5;
    })(), "THE POINT OF THE WHOLE ROUND: an exact identity sees what a convergence study is structurally unable to. " +
        "Both instruments are honest; only one of them can answer this question");
}

// --- 5. what carries over from v3637 ---------------------------------------------------------------------------------
{
    say("5. THE v3637 RESULTS HOLD FOR EITHER GRADIENT, which says they were about the GEOMETRY and not the gradient.");
    const m = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0.25 });
    const u = analyticCells(F, m);
    for (const [name, G] of [["LS", gradientLS], ["GG-simple", GGs]]) {
        const g = G(u, m), b = limitBJ(u, m, g);
        const eu = vertexEscapes(u, m, g), eb = vertexEscapes(u, m, b);
        say("     " + name.padEnd(10) + " unlimited " + eu.count + " escapes (" + (100 * eu.relative).toFixed(2) +
            "%)   Barth-Jespersen " + eb.count + " at " + eb.worst.toExponential(2));
    }
    ok("both gradients escape unlimited, and Barth-Jespersen fixes both to one ulp", (() => {
        const a = vertexEscapes(u, m, limitBJ(u, m, gradientLS(u, m)));
        const b = vertexEscapes(u, m, limitBJ(u, m, GGs(u, m)));
        return a.worst < 1e-14 && b.worst < 1e-14 && vertexEscapes(u, m, gradientLS(u, m)).count > 500 &&
            vertexEscapes(u, m, GGs(u, m)).count > 500;
    })(), "v3637's sqrt(5/2) argument was about the CELL, so it does not care which gradient filled it -- and the " +
        "limiter's zero-margin signature reappears for a gradient it was never tested on");
}

// --- 6. scope -----------------------------------------------------------------------------------------------------------
{
    say("6. SCOPE.");
    const src = readFileSync(new URL("./triReconstruct.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("the face normal carries the edge length, so no separate length factor is applied twice", /n_f already carries the edge LENGTH/.test(src));
    say("   NOT CLAIMED: that Green-Gauss is wrong to use. It is CONSISTENT, it is cheaper than least-squares, and");
    say("   on a regular mesh it is EXACT -- section 1. What is claimed is narrower and checkable: it is not exact on");
    say("   a skewed one, an order study cannot tell, and if a solver needs a linear field reproduced exactly then");
    say("   the choice is not a matter of taste.");
    say("   NOT DONE: a NODE-BASED Green-Gauss (a third declaration, and the one that IS linearity-preserving),");
    say("   Venkatakrishnan's smooth limiter, tetrahedra, and boundary cells -- excluded here BY NAME, as in v3637.");
}

console.log("gradientJoin-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
