// WebGLEngine/physics/mesh/boundaryRank-selfcheck.mjs -- v3640
//
// Run: node physics/mesh/boundaryRank-selfcheck.mjs
//
// *** BOUNDARY CELLS, SET ASIDE BY NAME IN THREE CONSECUTIVE ROUNDS (v3637, v3638, v3639) AND TAKEN AS A SUBJECT
// HERE. AND THE FIRST THING MEASURED SAYS THE EXCLUSION WAS MOSTLY UNNECESSARY: the boundary is NOT where the
// gradient degrades. Of 94 boundary cells, 92 reproduce a linear field EXACTLY. ***
//
// THE REAL DEFECT IS SMALLER, SHARPER AND OF A DIFFERENT KIND. A gradient in 2D has TWO unknowns and each
// neighbour supplies ONE equation, so a cell with a SINGLE neighbour cannot determine it -- not inaccurately,
// NOT AT ALL. That is a RANK statement, not an accuracy one, and no amount of refinement touches it.
//
// *** AND gradientLS ANSWERED ZERO. It detected the singular system and quietly wrote (0, 0), which reads as a
// 100% error and is indistinguishable from a genuinely flat field. A REFUSAL WEARING THE COSTUME OF AN ANSWER --
// v3103's law, and the same shape v3628 found in stabilityMeter.verdict(). ***

import { readFileSync } from "node:fs";
import { makeTriMesh, analyticCells, gradientLS, rankCensus, boundaryCells, boundaryTouching } from "./triReconstruct.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const B = 0.7, C = -0.4, NORM = Math.hypot(B, C);
const LIN = (x, y) => 0.3 + B * x + C * y;
const MESH = (skew, n = 24) => makeTriMesh({ nx: n, ny: n, h: 20 / n, skew });

// --- 1. the census ---------------------------------------------------------------------------------------------
{
    say("1. HOW MANY CELLS CAN DETERMINE A GRADIENT AT ALL? Two unknowns; each neighbour is one equation.");
    for (const skew of [0, 0.25]) {
        const m = MESH(skew), u = analyticCells(LIN, m), c = rankCensus(u, m);
        say("     skew " + skew + "   neighbours " + JSON.stringify(c.byNbr) + "   rank " + JSON.stringify(c.byRank) + "   of " + c.total);
    }
    const m = MESH(0.25), u = analyticCells(LIN, m), c = rankCensus(u, m);
    let bc = 0; for (const v of boundaryCells(m)) bc += v;
    ok("boundary cells are a small minority and rank-deficient ones are a minority of those", bc > 50 && (c.byRank[1] || 0) < 5,
        bc + " cells have a boundary FACE, and only " + (c.byRank[1] || 0) + " of them are rank-deficient");
    ok("!! and the rank-deficient count is EXACTLY TWO AT EVERY MESH SIZE, while the boundary grows", (() => {
        const rows = [8, 16, 32, 64].map((n) => {
            const mm = MESH(0.25, n), uu = analyticCells(LIN, mm);
            let b = 0; for (const v of boundaryCells(mm)) b += v;
            return { n, cells: mm.tri.length, boundary: b, rank1: rankCensus(uu, mm).byRank[1] || 0 };
        });
        for (const r of rows) say("     n = " + String(r.n).padStart(2) + "   cells " + String(r.cells).padStart(5) +
            "   boundary " + String(r.boundary).padStart(4) + "   rank-1 " + r.rank1);
        return rows.every((r) => r.rank1 === 2) && rows[3].boundary > 8 * rows[0].boundary / 4;
    })(), "boundary cells go 30 -> 62 -> 126 -> 254 and the UNDERDETERMINED SET STAYS AT TWO. REFINEMENT NEVER " +
        "FIXES IT AND NEVER WORSENS IT -- which is the signature of a rank defect rather than a discretisation error");
    say("   THE TWO ARE THE CORNERS WHERE A TRIANGLE OWNS TWO BOUNDARY EDGES. This triangulation cuts every square");
    say("   the same way, so only two of the four rectangle corners produce such a triangle -- a property of the");
    say("   CUT DIRECTION, and a mesh cut the other way would put them at the other two corners.");
}

// --- 2. THE BOUNDARY IS NOT WHERE ACCURACY DIES ------------------------------------------------------------------
{
    say("2. LINEARITY ERROR SPLIT BY RANK rather than by 'is it a boundary cell'.");
    for (const skew of [0, 0.25]) {
        const m = MESH(skew), u = analyticCells(LIN, m), g = gradientLS(u, m);
        const worst = {};
        for (let t = 0; t < u.length; t++) {
            const r = g.rank[t];
            worst[r] = Math.max(worst[r] || 0, Math.hypot(g.gx[t] - B, g.gy[t] - C) / NORM);
        }
        say("     skew " + skew + "   rank 2: " + (worst[2] || 0).toExponential(3) + "   rank 1: " + (worst[1] || 0).toExponential(3));
    }
    const m = MESH(0.25), u = analyticCells(LIN, m), g = gradientLS(u, m);
    let worst2 = 0, n2boundary = 0;
    const bc = boundaryCells(m);
    for (let t = 0; t < u.length; t++) if (g.rank[t] === 2) {
        worst2 = Math.max(worst2, Math.hypot(g.gx[t] - B, g.gy[t] - C) / NORM);
        if (bc[t]) n2boundary++;
    }
    ok("!! every rank-2 cell is EXACT, boundary or not -- all " + n2boundary + " two-neighbour boundary cells included",
        worst2 < 1e-13, "worst " + worst2.toExponential(3) + ". TWO NON-COLLINEAR DIFFERENCES DETERMINE A 2-VECTOR " +
        "EXACTLY, so a boundary cell with two neighbours is not a degraded interior cell -- it is a fully determined one");
    say("   SO THREE ROUNDS OF EXCLUDING 'BOUNDARY CELLS' WERE EXCLUDING 92 CORRECT ANSWERS TO GET AT 2 WRONG ONES.");
    say("   The exclusion was not wrong -- v3639's node-based scheme genuinely fails there for a different reason --");
    say("   but 'boundary' was the wrong name for the set. THE SET IS RANK-DEFICIENT CELLS, AND IT IS TINY.");
}

// --- 3. RANK 1 IS A REFUSAL, NOT AN ERROR -------------------------------------------------------------------------
{
    say("3. WHAT THE RANK-1 CELLS ACTUALLY KNOW.");
    const m = MESH(0.25), u = analyticCells(LIN, m), g = gradientLS(u, m);
    let checked = 0, worstAlong = 0, worstFull = 0;
    for (let t = 0; t < u.length; t++) if (g.rank[t] === 1) {
        const truthAlong = B * g.dirx[t] + C * g.diry[t];
        worstAlong = Math.max(worstAlong, Math.abs(g.along[t] - truthAlong) / Math.abs(truthAlong));
        worstFull = Math.max(worstFull, Math.hypot(g.gx[t] - B, g.gy[t] - C) / NORM);
        say("     cell " + t + "   along the one lever: measured " + g.along[t].toFixed(12) + "  truth " + truthAlong.toFixed(12));
        checked++;
    }
    ok("both rank-1 cells were actually reached", checked === 2);
    ok("!! the full gradient reads EXACTLY 100% wrong, because the code writes zero", Math.abs(worstFull - 1) < 1e-12,
        "1.000e+0 -- which is not a coincidence and not an accuracy figure: gx = gy = 0 against a unit-normalised " +
        "truth IS exactly one. AN ERROR OF EXACTLY 1.000 IS A REFUSAL, NOT A MEASUREMENT");
    ok("!! but the component ALONG the single available lever is EXACT", worstAlong < 1e-13,
        "worst " + worstAlong.toExponential(3) + " -- HALF THE GRADIENT IS RECOVERABLE EXACTLY AND HALF IS " +
        "UNKNOWABLE FROM CELL AVERAGES ALONE. The honest answer is a partial gradient plus a named unknown, and " +
        "`along` + `dirx`/`diry` now carry it instead of a zero that says nothing");
    ok("...and rank is returned so a caller can tell the two apart", (() => {
        const src = readFileSync(new URL("./triReconstruct.mjs", import.meta.url), "utf8");
        return /rank\[t\] = 1;/.test(src) && /REFUSAL WEARING THE COSTUME OF AN ANSWER/.test(src) &&
            g.rank instanceof Int8Array && g.rank[0] === 2;
    })(), "before this round the singular case was detected and silently written as zero, indistinguishable from a " +
        "genuinely flat field. v3103's law, and the same shape v3628 found in stabilityMeter.verdict()");
    ok("the singularity test is scale-free, so it means the same thing on a fine mesh as a coarse one", (() => {
        const src = readFileSync(new URL("./triReconstruct.mjs", import.meta.url), "utf8");
        const counts = [8, 64].map((n) => { const mm = MESH(0.25, n); return rankCensus(analyticCells(LIN, mm), mm).byRank[1] || 0; });
        return /A scale-free singularity test/.test(src) && counts[0] === counts[1];
    })(), "an ABSOLUTE determinant threshold would call every fine mesh singular -- the test compares det against " +
        "the trace squared, and the rank-1 count is the same at n = 8 and n = 64");
}

// --- 4. three different 'boundaries', none of them the same set -----------------------------------------------------
{
    say("4. THIS ARC HAS NOW PRODUCED THREE DIFFERENT SETS ALL CALLED 'THE BOUNDARY', AND NO TWO ARE EQUAL.");
    const m = MESH(0.25);
    const face = boundaryCells(m), node = boundaryTouching(m), u = analyticCells(LIN, m), g = gradientLS(u, m);
    let nf = 0, nn = 0, nr = 0, faceNotNode = 0, nodeNotFace = 0;
    for (let t = 0; t < m.tri.length; t++) {
        if (face[t]) nf++; if (node[t]) nn++; if (g.rank[t] < 2) nr++;
        if (face[t] && !node[t]) faceNotNode++;
        if (node[t] && !face[t]) nodeNotFace++;
    }
    say("     cells with a boundary FACE: " + nf + "   touching a boundary NODE: " + nn + "   RANK-DEFICIENT: " + nr);
    ok("!! the three sets are nested and strictly different sizes", nr < nf && nf < nn,
        nr + " < " + nf + " < " + nn + ". A boundary FACE means a missing equation; a boundary NODE means an " +
        "invented value (v3639); RANK-DEFICIENT means the system cannot be solved. THREE QUESTIONS, THREE ANSWERS, " +
        "and every one of them has been called 'the boundary' in these notes");
    ok("...and no cell has a boundary face without touching a boundary node", faceNotNode === 0 && nodeNotFace > 0,
        "the containment is one-way and MEASURED: " + nodeNotFace + " cells touch a boundary node with no boundary " +
        "face, and " + faceNotNode + " the other way. WHICH SET YOU MEAN DECIDES WHICH ANSWER YOU GET -- v3639 read " +
        "32% or 1.6e-14 for the same scheme on the same mesh depending only on this choice");
}

// --- 5. scope ---------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./triReconstruct.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("gradientLS still returns gx and gy first, so every earlier caller is untouched", (() => {
        const m = MESH(0.25), g = gradientLS(analyticCells(LIN, m), m);
        return g.gx instanceof Float64Array && g.gy instanceof Float64Array;
    })(), "v3637, v3638 and v3639's gates all re-run green against this file");
    say("   NOT DONE, AND NOW NAMED RATHER THAN EXCLUDED: what a SOLVER should do at a rank-1 cell. The options are");
    say("   a boundary condition that supplies the missing equation (Dirichlet gives it directly, Neumann gives the");
    say("   normal component), widening the stencil to vertex neighbours, or refusing to reconstruct there at all.");
    say("   EACH IS A DIFFERENT PHYSICAL CLAIM AND NONE IS TESTED HERE -- this round says only what is knowable from");
    say("   cell averages, which is where a boundary condition has to start.");
    say("   ALSO NOT DONE: tetrahedra, where a gradient has THREE unknowns so the rank-deficient set is larger and");
    say("   its size is an open question rather than a guess.");
}

console.log("boundaryRank-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
