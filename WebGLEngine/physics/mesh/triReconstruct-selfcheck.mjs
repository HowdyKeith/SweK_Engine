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
    gradientGG, gradientGGNode, nodeValues, linearityError, boundaryCells, boundaryTouching, rankCensus,
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

// --- 4b. *** THE GREEN-GAUSS ROUND SHIPPED AND THIS GATE NEVER LEARNED ABOUT IT *** -----------------------------------
//
// v3941 -- section 5's NOT DONE list below used to end with "Green-Gauss against least-squares (two standard
// gradients that disagree on skewed cells -- a two-declarations round of its own)". THAT ROUND HAPPENED:
// gradientGG, nodeValues, gradientGGNode, linearityError, boundaryCells and boundaryTouching are all in the
// module, each with a header paragraph naming an exact property, AND NOT ONE OF THEM WAS IMPORTED HERE. Seven
// definitions, no keys, and a gate still advertising the work as outstanding. definitionGates counted them and
// was right to.
//
// THE INSTRUMENT IS linearityError: reconstruct a field that IS linear, u = a + bx + cy, and ask each gradient
// scheme for b and c back. A linearity-preserving scheme returns them to machine precision. Nothing else here
// is a tolerance -- 1e-12 against 1e-3 is not a close call.
{
    say("4b. LINEARITY PRESERVATION -- five gradient schemes on the same field, and the regular mesh cannot tell them apart.");
    const reg = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0 });
    const skw = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0.25 });
    const SCHEMES = {
        "LS":          gradientLS,
        "GG simple":   (u, m) => gradientGG(u, m, { weighting: "simple" }),
        "GG distance": (u, m) => gradientGG(u, m, { weighting: "distance" }),
        "GGnode ls":   (u, m) => gradientGGNode(u, m, { nodeMode: "ls" }),
        "GGnode idw":  (u, m) => gradientGGNode(u, m, { nodeMode: "idw" }),
    };
    const on = (m) => Object.fromEntries(Object.entries(SCHEMES).map(([k, g]) => [k, linearityError(m, { grad: g })]));
    const R = on(reg), S = on(skw);
    for (const k of Object.keys(SCHEMES)) say(`     ${k.padEnd(12)} regular ${R[k].toExponential(3)}   sheared ${S[k].toExponential(3)}`);

    ok("!! *** THE REGULAR MESH CERTIFIES ALL FIVE SCHEMES, INCLUDING THE TWO THAT ARE WRONG ***",
        Object.values(R).every((e) => e < 1e-12),
        Object.entries(R).map(([k, e]) => `${k} ${e.toExponential(1)}`).join(", ") +
        " -- every one at machine precision. ON A CARTESIAN-LIKE MESH THE FACE MIDPOINT REALLY IS HALFWAY " +
        "BETWEEN THE CENTROIDS, so the assumption the simple average makes is TRUE and the scheme that makes it " +
        "is exact. A gate run only on the regular mesh would report five linearity-preserving gradients and " +
        "three of those five would be a fiction of the fixture.");

    ok("!! *** AND THE SHEARED MESH SPLITS THEM BY ELEVEN ORDERS OF MAGNITUDE ***",
        S["LS"] < 1e-12 && S["GGnode ls"] < 1e-12 &&
        S["GG simple"] > 1e-3 && S["GG distance"] > 1e-3 && S["GGnode idw"] > 1e-5,
        `LS ${S["LS"].toExponential(2)} and GGnode-ls ${S["GGnode ls"].toExponential(2)} are EXACT; GG simple ` +
        `${S["GG simple"].toExponential(2)}, GG distance ${S["GG distance"].toExponential(2)}, GGnode idw ` +
        `${S["GGnode idw"].toExponential(2)} are not. Same field, same mesh, same instrument.`);

    ok("!! ...and DISTANCE WEIGHTING BUYS LESS THAN A FACTOR OF TWO, so the face position was not the whole fault",
        S["GG simple"] / S["GG distance"] > 1.2 && S["GG simple"] / S["GG distance"] < 4,
        `${(S["GG simple"] / S["GG distance"]).toFixed(2)}x better and still four orders from exact. The module's ` +
        "header blames the simple average for assuming the face midpoint sits halfway between the centroids; " +
        "PUTTING THE FACE VALUE AT ITS TRUE POSITION FIXES A FRACTION OF IT. Cell-based Green-Gauss is not " +
        "linearity-preserving on skewed triangles for a reason the interpolation position does not reach.");

    // *** THE CLAIM THE MODULE'S HEADER MAKES, AS A MEASUREMENT: it is the NODE RULE, not Green-Gauss. ***
    ok("!! *** 'NODE-BASED GREEN-GAUSS IS LINEARITY-PRESERVING' IS A CLAIM ABOUT THE NODE INTERPOLATION ***",
        S["GGnode ls"] < 1e-12 && S["GGnode idw"] > 1e-5,
        `identical Green-Gauss machinery over identical faces, differing ONLY in how a node of a cell-average ` +
        `field gets a value: least-squares plane ${S["GGnode ls"].toExponential(2)}, inverse-distance ` +
        `${S["GGnode idw"].toExponential(2)}. *** ELEVEN ORDERS APART, AND THE WORD 'GREEN-GAUSS' IS THE HALF ` +
        "THAT DID NOT CHANGE. The property belongs to the fourth declaration nobody names.");

    // nodeValues on its own, at the nodes rather than through a gradient -- the plane fit is exact by construction.
    {
        const A = (x, y) => 0.3 + 0.7 * x - 0.4 * y;
        const u = analyticCells(A, skw);
        const faceCount = new Map(), key = (p, q) => (p < q ? p + ":" + q : q + ":" + p);
        for (const [a, b, c] of skw.tri) for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = key(p, q); faceCount.set(k, (faceCount.get(k) || 0) + 1); }
        const interior = new Uint8Array(skw.vx.length).fill(1);
        for (const [k, n] of faceCount) if (n === 1) { const [p, q] = k.split(":").map(Number); interior[p] = 0; interior[q] = 0; }
        const worstOf = (mode) => {
            const nv = nodeValues(u, skw, { mode });
            let worst = 0, cnt = 0;
            for (let v = 0; v < skw.vx.length; v++) { if (!interior[v]) continue; cnt++; worst = Math.max(worst, Math.abs(nv[v] - A(skw.vx[v], skw.vy[v]))); }
            return { worst, cnt };
        };
        const ls = worstOf("ls"), idw = worstOf("idw");
        ok("!! nodeValues 'ls' reproduces a linear field EXACTLY at every interior node, and 'idw' does not",
            ls.worst < 1e-12 && idw.worst > 1e-5 && ls.cnt === idw.cnt,
            `${ls.cnt} interior nodes: ls worst ${ls.worst.toExponential(2)}, idw worst ${idw.worst.toExponential(2)}. ` +
            "A plane fitted by least squares to samples OF a plane returns that plane whatever the stencil looks " +
            "like; a distance-weighted mean of them does not unless the neighbours happen to sit symmetrically " +
            "about the node. THIS IS WHERE THE ELEVEN ORDERS ABOVE COME FROM, measured one level down.");
    }

    // *** THE TWO INTERIORS, WHICH IS THE FINDING THE MODULE SAYS COST IT A ROUND'S HEADLINE. ***
    {
        const bc = boundaryCells(skw), bt = boundaryTouching(skw);
        let nbc = 0, nbt = 0, faceInteriorNodeBoundary = 0, subset = true;
        for (let t = 0; t < bc.length; t++) {
            nbc += bc[t]; nbt += bt[t];
            if (bc[t] && !bt[t]) subset = false;
            if (!bc[t] && bt[t]) faceInteriorNodeBoundary++;
        }
        ok("!! boundaryTouching is STRICTLY LARGER than boundaryCells, and one contains the other",
            subset && nbt > nbc && faceInteriorNodeBoundary > 0,
            `${nbc} cells have a boundary FACE, ${nbt} touch a boundary NODE, and ${faceInteriorNodeBoundary} ` +
            "cells have three neighbours and still touch one. Two different sets wearing the word 'boundary'.");

        const looseIdw = linearityError(skw, { grad: (u, m) => gradientGGNode(u, m, { nodeMode: "idw" }), strictInterior: false });
        const strictIdw = S["GGnode idw"];
        const looseSimple = linearityError(skw, { grad: (u, m) => gradientGG(u, m, { weighting: "simple" }), strictInterior: false });
        ok("!! *** AND WHICH INTERIOR IS RIGHT DEPENDS ON WHAT THE SCHEME READS, MEASURED BOTH WAYS ***",
            looseIdw / strictIdw > 100 && looseSimple === S["GG simple"],
            `the node-based scheme moves from ${strictIdw.toExponential(2)} to ${looseIdw.toExponential(2)} -- ` +
            `${(looseIdw / strictIdw).toFixed(0)}x -- when the ${faceInteriorNodeBoundary} face-interior ` +
            "node-boundary cells are let back in, while cell-based Green-Gauss returns the SAME NUMBER BIT FOR " +
            "BIT because it never looks at a node. *** THE NEIGHBOUR COUNT IS THE WRONG INTERIOR FOR A SCHEME " +
            "THAT READS NODES, and this is that sentence as two numbers and an exact equality.");
    }

    // The census: a count, not a verdict -- the module says so and this reports it under the same rule.
    {
        const u = analyticCells((x, y) => 0.3 + 0.7 * x - 0.4 * y, skw);
        const c = rankCensus(u, skw);
        say(`     rankCensus: by neighbour count ${JSON.stringify(c.byNbr)}, by rank ${JSON.stringify(c.byRank)}, total ${c.total}`);
        ok("!! rankCensus accounts for EVERY cell, and only the ones short of two neighbours are rank-deficient",
            Object.values(c.byNbr).reduce((a, b) => a + b, 0) === c.total &&
            Object.values(c.byRank).reduce((a, b) => a + b, 0) === c.total &&
            (c.byRank[2] || 0) === c.total - (c.byNbr[1] || 0),
            `${c.total} cells, and rank 2 is reached by exactly the ${c.total - (c.byNbr[1] || 0)} cells with two ` +
            "or more neighbours -- a plane through two differences and no more. REPORTED AS A CENSUS: the split " +
            "is a property of this triangulation, so the ACCOUNTING is asserted and the numbers are not.");
    }
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
    say("   DONE SINCE, AND GRADED IN 4b: Green-Gauss against least-squares. That round shipped six functions into");
    say("   the module and this gate was not told, so it went on advertising the work as outstanding while nothing");
    say("   exercised it -- the v3941 finding, and a reminder that a NOT DONE list is a claim like any other.");
    say("   STILL NOT DONE: Venkatakrishnan's smooth limiter, tetrahedra, and boundary cells, which are excluded");
    say("   here by name rather than folded into the interior average.");
}

console.log("triReconstruct-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
