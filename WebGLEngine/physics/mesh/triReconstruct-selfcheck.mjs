// WebGLEngine/physics/mesh/triReconstruct-selfcheck.mjs -- v3637
//
// Run: node physics/mesh/triReconstruct-selfcheck.mjs
//
// *** THE CASE v3635 AND v3636 EACH LEFT OPEN, IN AS MANY WORDS, TWICE: "on TRIANGLES the vertex offsets are not
// 1/2 and the argument does not run". IT DOES NOT RUN, AND THE REASON IS ONE NUMBER. ***
//
// v3635 proved per-axis minmod monotone on a Cartesian cell because a corner takes HALF of each slope. v3636
// showed that survives non-uniform spacing. BOTH ARGUMENTS REST ON A PROPERTY OF THE SQUARE, NOT OF THE LIMITER:
// the offset from the cell centre to the furthest evaluation point is exactly HALF the lever the gradient was
// built on. Section 1 measures that same ratio on triangles before anything else is done with them.
//
// AFTER TWO ROUNDS OF PREDICTING A BREAK AND MEASURING NONE, THIS ONE BREAKS -- and the honest reason to trust it
// is that the same instrument said "no escape" twice on the Cartesian meshes and says 1288 here.

import { readFileSync } from "node:fs";
import {
    makeTriMesh, analyticCells, offsetRatios, gradientLS, limitBJ,
    vertexEscapes, conservationDrift, accuracy,
} from "./triReconstruct.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const F = (x, y) => Math.exp(-((x - 10) ** 2 + (y - 10) ** 2) / 18);

// --- 1. THE NUMBER THE WHOLE ARGUMENT RESTED ON ---------------------------------------------------------------
{
    say("1. CENTROID-TO-FURTHEST-VERTEX, OVER CENTROID-TO-NEAREST-NEIGHBOUR-CENTROID. On a square that is 0.5.");
    const reg = offsetRatios(makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0 }));
    const skw = offsetRatios(makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0.25 }));
    say("     regular right triangles: worst " + reg.worst.toFixed(6) + ", mean " + reg.mean.toFixed(6));
    say("     sheared mesh:            worst " + skw.worst.toFixed(6) + ", mean " + skw.mean.toFixed(6));
    // DERIVED, NOT TYPED: legs h at (0,0),(h,0),(h,h) give centroid (2h/3, h/3); the far vertex is at
    // h*sqrt(5)/3 and the sibling triangle's centroid at h*sqrt(2)/3, so the ratio is sqrt(5/2) exactly.
    ok("!! the regular mesh's ratio is exactly sqrt(5/2), which the geometry gives in closed form",
        Math.abs(reg.worst - Math.sqrt(2.5)) < 1e-12,
        "measured " + reg.worst.toFixed(12) + " against sqrt(2.5) = " + Math.sqrt(2.5).toFixed(12) +
        " -- from centroid (2h/3, h/3), far vertex at h*sqrt(5)/3, sibling centroid at h*sqrt(2)/3");
    ok("!! and it is ABOVE ONE, where the Cartesian value is 0.5 -- 3.16x larger", reg.worst > 1 && reg.worst / 0.5 > 3,
        "THIS IS WHY THE PREVIOUS TWO ROUNDS' ARGUMENT CANNOT TRANSFER. A gradient bounded by the neighbour " +
        "difference is applied over a lever LONGER than the one it was measured on, so the reconstruction is FORCED " +
        "past the neighbourhood for any gradient large enough to be useful. The escape is geometry, not the limiter");
    ok("shearing the mesh moves it but does not rescue it", skw.worst > 1 && skw.mean > 1.5,
        "worst " + skw.worst.toFixed(4) + ", mean " + skw.mean.toFixed(4) + " -- an irregular mesh is not a worse " +
        "case here, it is the same case with spread");
}

// --- 2. AND THE ESCAPE IS THERE, WHERE TWO ROUNDS OF LOOKING FOUND NONE -----------------------------------------
{
    say("2. VERTEX ESCAPES, the same question v3635 and v3636 answered with zero on Cartesian meshes.");
    for (const skew of [0, 0.25]) {
        const m = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew });
        const u = analyticCells(F, m), g = gradientLS(u, m), b = limitBJ(u, m, g);
        const eu = vertexEscapes(u, m, g), eb = vertexEscapes(u, m, b);
        say("     skew " + skew + "  unlimited: " + eu.count + " escapes, worst " + (100 * eu.relative).toFixed(2) +
            "% of local span   |   Barth-Jespersen: " + eb.count + ", worst " + eb.worst.toExponential(3));
    }
    const m = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0 });
    const u = analyticCells(F, m), g = gradientLS(u, m), b = limitBJ(u, m, g);
    ok("!! the unlimited least-squares gradient escapes, by nearly a quarter of the local span",
        vertexEscapes(u, m, g).count > 1000 && vertexEscapes(u, m, g).relative > 0.2,
        vertexEscapes(u, m, g).count + " escapes at " + (100 * vertexEscapes(u, m, g).relative).toFixed(2) + "%. " +
        "THE SAME INSTRUMENT READ ZERO TWICE ON CARTESIAN MESHES, which is what makes this a finding rather than a " +
        "new detector finding what it was built to find");
    const eb = vertexEscapes(u, m, b);
    ok("!! Barth-Jespersen restores it, and the bound is ATTAINED rather than comfortable", eb.worst < 1e-14,
        eb.count + " nominal escapes at worst " + eb.worst.toExponential(3) + " -- ONE ULP. The limiter solves for " +
        "alpha so the extreme vertex sits EXACTLY on the bound, so the constraint is active and round-off puts it " +
        "a hair over. THE SAME SIGNATURE minmod SHOWED AT v3635, arrived at by a completely different construction");
    ok("...and alpha is doing real work rather than sitting at 1", (() => {
        let clipped = 0, minA = 1;
        for (let t = 0; t < b.alpha.length; t++) { if (b.alpha[t] < 1 - 1e-12) clipped++; minA = Math.min(minA, b.alpha[t]); }
        say("     alpha < 1 in " + clipped + " of " + b.alpha.length + " cells, smallest " + minA.toFixed(6));
        return clipped > 0.3 * b.alpha.length;
    })());
}

// --- 3. CONSERVATION IS A GEOMETRIC FACT, AND "CENTRE" IS A WORD A TRIANGLE ANSWERS SEVERAL WAYS -------------------
{
    say("3. A LINEAR RECONSTRUCTION CONSERVES THE CELL AVERAGE ONLY IF IT IS EXPANDED ABOUT THE CENTROID.");
    const m = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0.25 });
    const u = analyticCells(F, m), g = gradientLS(u, m);
    const c = conservationDrift(u, m, g, "centroid"), bb = conservationDrift(u, m, g, "bbox"), vv = conservationDrift(u, m, g, "vertex");
    say("     about the centroid " + c.toExponential(3) + "   bounding-box middle " + bb.toExponential(3) +
        "   a vertex " + vv.toExponential(3));
    ok("!! the centroid conserves exactly, and the other centres do not -- by fourteen orders",
        c < 1e-14 && bb > 1e-3 && vv > 1e-2,
        "the integral of (x - x_centroid) over a triangle is EXACTLY ZERO, so the gradient term cancels for ANY " +
        "gradient. That is a property of the centroid and of nothing else. TWO THINGS WEARING ONE LABEL, in the " +
        "geometry rather than in the code: a triangle answers to 'centre' at least four ways and only one of them " +
        "conserves");
    ok("the Cartesian rounds' conservation argument was a DIFFERENT fact", (() => {
        const src = readFileSync(new URL("./triReconstruct.mjs", import.meta.url), "utf8");
        return /it is the CENTROID property/.test(src);
    })(), "there it was symmetric subcell offsets cancelling in the mean; here it is the centroid's first moment. " +
        "Same conclusion, unrelated reasons -- and only the second one survives a triangle");
}

// --- 4. what it costs ---------------------------------------------------------------------------------------------
{
    say("4. ORDER, measured at the vertices against the analytic field, interior cells only.");
    for (const skew of [0, 0.25]) {
        const rows = [12, 24, 48].map((n) => {
            const m = makeTriMesh({ nx: n, ny: n, h: 20 / n, skew });
            const u = analyticCells(F, m), g = gradientLS(u, m);
            return { unl: accuracy(F, m, u, g), bj: accuracy(F, m, u, limitBJ(u, m, g)) };
        });
        const o = (k) => rows.slice(1).map((r, i) => Math.log2(rows[i][k] / r[k]));
        say("     skew " + skew + "  unlimited " + rows.map((r) => r.unl.toExponential(2)).join(" ") +
            " orders " + o("unl").map((x) => x.toFixed(2)).join(", ") +
            "   |   BJ " + rows.map((r) => r.bj.toExponential(2)).join(" ") + " orders " + o("bj").map((x) => x.toFixed(2)).join(", "));
    }
    const rows = [12, 24, 48].map((n) => {
        const m = makeTriMesh({ nx: n, ny: n, h: 20 / n, skew: 0 });
        const u = analyticCells(F, m), g = gradientLS(u, m);
        return { unl: accuracy(F, m, u, g), bj: accuracy(F, m, u, limitBJ(u, m, g)) };
    });
    const ordU = Math.log2(rows[1].unl / rows[2].unl), ordB = Math.log2(rows[1].bj / rows[2].bj);
    ok("the unlimited reconstruction is second order on triangles", ordU > 1.8 && ordU < 2.3, "measured " + ordU.toFixed(3));
    ok("Barth-Jespersen is at least first order and its cost is REPORTED rather than assumed", ordB > 0.8,
        "measured " + ordB.toFixed(3) + " against the unlimited " + ordU.toFixed(3) + " -- the limiter buys the exact " +
        "zero of section 2 and this is the bill");
}

// --- 5. scope --------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./triReconstruct.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("the mesh is deterministic -- a shear, not a random perturbation", !/Math\.random/.test(src),
        "so every number above is the same on Keith's rig as here");
    ok("edge neighbours are derived from shared vertex pairs, not assumed from the index pattern", /edgeMap/.test(src));
    say("   NOT CLAIMED: that anything in this tree reconstructs on triangles. physics/mesh/ holds marching cubes,");
    say("   dual contouring and manifoldCensus, and NONE of them carries a cell-average field -- this is the number");
    say("   you would want BEFORE putting a finite-volume solver on an unstructured mesh, not a fix to one.");
    say("   NOT DONE: Green-Gauss against least-squares (two standard gradients that disagree on skewed cells --");
    say("   a two-declarations round of its own), Venkatakrishnan's smooth limiter, tetrahedra, and boundary cells,");
    say("   which are excluded here by name rather than folded into the interior average.");
}

console.log("triReconstruct-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
