// WebGLEngine/physics/mesh/rankRepair3-selfcheck.mjs -- v3643
//
// Run: node physics/mesh/rankRepair3-selfcheck.mjs
//
// v3642 measured three repairs in 2D and predicted that the VERDICTS would carry to 3D -- the key is
// dimension-free -- while THE TRADE would not, because 6n deficient cells against a widened stencil on every
// cell is a different sum from two cells against the same widening.
//
// *** BOTH HALVES OF THAT PREDICTION HOLD, AND ONE RESULT IS SHARPER IN 3D THAN IT WAS IN 2D: a false
// zero-Neumann condition reads 1.134 here against the REFUSAL'S 1.000. IN 2D THE FALSE REPAIR LOOKED BETTER THAN
// DOING NOTHING (0.547 against 1.000) AND IN 3D IT IS WORSE THAN DOING NOTHING. The 2D number was flattering by
// accident of dimension, and a reader who had only seen it would have drawn a milder conclusion than the truth. ***

import { readFileSync } from "node:fs";
import { makeTetMesh, analyticCells3, gradientLS3 } from "./tetReconstruct.mjs";
import { repairError3, vertexNeighbours3, gradientRepaired3, boundaryFaces3 } from "./rankRepair3.mjs";
import { makeTriMesh, analyticCells, gradientLS } from "./triReconstruct.mjs";
import { repairError, vertexNeighbours } from "./rankRepair.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const LIN3 = (x, y, z) => 0.3 + 0.7 * x - 0.4 * y + 0.55 * z;
const M = makeTetMesh({ nx: 8, ny: 8, nz: 8, h: 1, skew: 0.25 });
const U = analyticCells3(LIN3, M);
const G0 = gradientLS3(U, M);
const MASK = new Uint8Array(M.tet.length);
let NDEF = 0; for (let t = 0; t < M.tet.length; t++) if (G0.rank[t] < 3) { MASK[t] = 1; NDEF++; }

// --- 1. the verdicts carry -----------------------------------------------------------------------------------
{
    say("1. THE SAME THREE REPAIRS, THE SAME EXACT KEY. " + NDEF + " deficient tets of " + M.tet.length + ".");
    const got = {};
    for (const [name, o] of [["no repair", { mode: "none" }], ["vertex stencil", { mode: "vertex" }],
        ["Dirichlet", { mode: "dirichlet" }], ["Neumann = 0", { mode: "neumann" }]]) {
        const r = repairError3(M, MASK, o); got[name] = r;
        say("     " + name.padEnd(15) + " deficient " + r.deficient.toExponential(3) + "   healthy " +
            r.healthy.toExponential(3) + "   still rank<3 " + r.stillLow + "   mean stencil " + r.meanStencil.toFixed(2));
    }
    ok("the VERTEX stencil restores exactness in 3D too", got["vertex stencil"].deficient < 1e-13 && got["vertex stencil"].stillLow === 0);
    ok("DIRICHLET restores exactness in 3D too", got["Dirichlet"].deficient < 1e-13 && got["Dirichlet"].stillLow === 0);
    ok("and a false NEUMANN still restores the RANK while getting the answer wrong",
        got["Neumann = 0"].stillLow === 0 && got["Neumann = 0"].deficient > 0.5,
        "RANK IS NOT CORRECTNESS, in either dimension");
    ok("!! and here the false repair is WORSE THAN THE REFUSAL, where in 2D it looked better",
        got["Neumann = 0"].deficient > got["no repair"].deficient,
        "3D reads " + got["Neumann = 0"].deficient.toFixed(3) + " against a refusal's " + got["no repair"].deficient.toFixed(3) +
        "; 2D read 0.547 against 1.000. THE 2D NUMBER WAS FLATTERING BY ACCIDENT OF DIMENSION -- a reader who had " +
        "only seen it would have drawn a MILDER CONCLUSION THAN THE TRUTH, which is the argument for running the " +
        "second dimension rather than asserting that the verdict carries");
    const honest = repairError3(M, MASK, { mode: "neumann", onlyWhereDeficient: MASK, honestNeumann: true });
    const zero = repairError3(M, MASK, { mode: "neumann", onlyWhereDeficient: MASK });
    ok("the mechanism is sound and the assertion is what is false, in 3D as in 2D",
        honest.deficient < 1e-13 && zero.deficient > 0.5 && honest.stillLow === zero.stillLow,
        honest.deficient.toExponential(3) + " with the true normal derivative against " + zero.deficient.toExponential(3) +
        " with zero -- same rank, same rows, only the right-hand side differs");
}

// --- 2. THE TRADE, WHICH IS WHERE THE DIMENSIONS PART COMPANY ------------------------------------------------------
{
    say("2. WHAT THE VERTEX WIDENING COSTS. This is the half v3642 said would NOT carry.");
    const vn3 = vertexNeighbours3(M);
    let sf3 = 0, sv3 = 0; for (let t = 0; t < M.tet.length; t++) { sf3 += M.nbr[t].length; sv3 += vn3[t].length; }
    const m2 = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0.25 });
    const u2 = analyticCells((x, y) => 0.3 + 0.7 * x - 0.4 * y, m2), g2 = gradientLS(u2, m2);
    const mask2 = new Uint8Array(m2.tri.length);
    let nd2 = 0; for (let t = 0; t < m2.tri.length; t++) if (g2.rank[t] < 2) { mask2[t] = 1; nd2++; }
    const vn2 = vertexNeighbours(m2);
    let sf2 = 0, sv2 = 0; for (let t = 0; t < m2.tri.length; t++) { sf2 += m2.nbr[t].length; sv2 += vn2[t].length; }
    say("     2D: mean face " + (sf2 / m2.tri.length).toFixed(2) + " -> vertex " + (sv2 / m2.tri.length).toFixed(2) +
        "   ratio " + (sv2 / sf2).toFixed(2) + "x   for " + nd2 + " deficient of " + m2.tri.length);
    say("     3D: mean face " + (sf3 / M.tet.length).toFixed(2) + " -> vertex " + (sv3 / M.tet.length).toFixed(2) +
        "   ratio " + (sv3 / sf3).toFixed(2) + "x   for " + NDEF + " deficient of " + M.tet.length);
    ok("!! the widening is roughly FOUR TIMES more expensive in 3D", (sv3 / sf3) / (sv2 / sf2) > 3,
        (sv3 / sf3).toFixed(2) + "x against " + (sv2 / sf2).toFixed(2) + "x -- a tet has four vertices and each is " +
        "shared by many more cells, so the neighbourhood does not merely gain a dimension, it multiplies");
    // THE HONEST ARITHMETIC, AND IT GOES THE OTHER WAY FROM WHAT THE RATIO SUGGESTS
    const extra2 = sv2 - sf2, extra3 = sv3 - sf3;
    say("     extra rows paid: 2D " + extra2 + " for " + nd2 + " cells = " + (extra2 / nd2).toFixed(0) +
        " per repaired cell;  3D " + extra3 + " for " + NDEF + " = " + (extra3 / NDEF).toFixed(0));
    ok("!! but PER REPAIRED CELL it is CHEAPER in 3D, not dearer -- the opposite of the obvious reading",
        extra3 / NDEF < extra2 / nd2,
        "because the deficient set grew 24x while the stencil grew 4x. TWO TRUE NUMBERS ANSWERING DIFFERENT " +
        "QUESTIONS: the TOTAL extra work is " + (extra3 / extra2).toFixed(1) + "x higher in 3D, and the cost PER " +
        "DEFECT FIXED is " + ((extra2 / nd2) / (extra3 / NDEF)).toFixed(2) + "x lower. Which one matters depends on " +
        "whether the budget is the solver's total or the engineer's patience, and quoting one as 'the cost' is the " +
        "shape this arc keeps finding");
    ok("Dirichlet meanwhile costs almost nothing in either dimension", (() => {
        const d3 = repairError3(M, MASK, { mode: "dirichlet" });
        const d2 = repairError(m2, mask2, { mode: "dirichlet" });
        say("     Dirichlet mean stencil: 3D " + d3.meanStencil.toFixed(2) + " against a bare " + (sf3 / M.tet.length).toFixed(2) +
            ";  2D max stencil " + d2.maxStencil);
        return d3.meanStencil < 1.2 * (sf3 / M.tet.length) && d3.deficient < 1e-13;
    })(), "so WHERE THE DATA EXISTS the choice is not close -- and the vertex stencil's whole appeal is that it " +
        "works where the data does not");
}

// --- 3. scope and the mesh checks ------------------------------------------------------------------------------------
{
    say("3. THE 3D MACHINERY, CHECKED BEFORE ANYTHING IS CONCLUDED FROM IT.");
    const bf = boundaryFaces3(M);
    let nfaces = 0, badNormal = 0;
    for (let t = 0; t < M.tet.length; t++) for (const f of bf[t]) {
        nfaces++;
        if (Math.abs(Math.hypot(f.nx, f.ny, f.nz) - 1) > 1e-12) badNormal++;
        if (f.nx * (f.mx - M.cx[t]) + f.ny * (f.my - M.cy[t]) + f.nz * (f.mz - M.cz[t]) <= 0) badNormal++;
    }
    ok("every boundary face has a unit normal pointing OUT of its tet", badNormal === 0 && nfaces > 100,
        nfaces + " boundary faces, all unit and all outward -- an inward normal would flip the sign of a Neumann " +
        "row and make the assertion a different one without saying so");
    ok("every face neighbour is also a vertex neighbour", (() => {
        const vn = vertexNeighbours3(M);
        for (let t = 0; t < M.tet.length; t++) { const s = new Set(vn[t]); for (const q of M.nbr[t]) if (!s.has(q)) return false; }
        return true;
    })(), "the widening is a strict superset, so it cannot lose information the face stencil had");
    ok("a repair that fails to restore rank still reports it", (() => {
        const g = gradientRepaired3(U, M, { mode: "none" });
        return g.rank instanceof Int8Array && [...g.rank].some((r) => r < 3);
    })(), "v3640's law kept through two dimensions and three repair modes");
    const src = readFileSync(new URL("./rankRepair3.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    say("   NOT DONE: a field with a genuine zero-flux wall, where the Neumann repair is exact and the honest");
    say("   choice -- named in v3642 and still not measured in either dimension. NOT DONE: a discontinuous field,");
    say("   where the vertex stencil's OWN assumption (that a distant cell is informative) is the one that breaks,");
    say("   and where it would be the widening rather than the boundary condition on trial.");
}

console.log("rankRepair3-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
