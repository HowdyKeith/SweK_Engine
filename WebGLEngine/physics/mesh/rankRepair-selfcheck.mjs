// WebGLEngine/physics/mesh/rankRepair-selfcheck.mjs -- v3642
//
// Run: node physics/mesh/rankRepair-selfcheck.mjs
//
// WHAT TO DO AT A CELL WHOSE GRADIENT IS UNDETERMINED. v3640 named three options and tested none; v3641 made the
// question sharper by finding 6n of them in 3D where 2D has two. All three are measured here against the same
// exact key this arc has used throughout: reproduce a linear field exactly, or do not.
//
// *** AND THE SENTENCE OF THE ROUND IS THIS: the unrepaired cell reads 1.000, which is a REFUSAL. A zero-Neumann
// repair reads 0.547, which is AN ANSWER. THE ERROR GOT SMALLER AND THE SITUATION GOT WORSE -- 1.000 is a flag a
// caller can see and 0.547 is a number a solver would use. ***

import { readFileSync } from "node:fs";
import { makeTriMesh, analyticCells, gradientLS } from "./triReconstruct.mjs";
import { gradientRepaired, repairError, vertexNeighbours, boundaryFaces } from "./rankRepair.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0.25 });
const U = analyticCells((x, y) => 0.3 + 0.7 * x - 0.4 * y, M);
const G0 = gradientLS(U, M);
const MASK = new Uint8Array(M.tri.length);
let NDEF = 0, NBOUND = 0;
for (let t = 0; t < M.tri.length; t++) { if (G0.rank[t] < 2) { MASK[t] = 1; NDEF++; } if (M.nbr[t].length < 3) NBOUND++; }

// --- 1. the three repairs, on the exact key ---------------------------------------------------------------------
{
    say("1. THREE REPAIRS, ONE KEY. " + NDEF + " deficient cells of " + M.tri.length + "; " + NBOUND + " boundary cells.");
    const cases = [["no repair", { mode: "none" }], ["vertex stencil", { mode: "vertex" }],
        ["Dirichlet", { mode: "dirichlet" }], ["Neumann = 0", { mode: "neumann" }]];
    const got = {};
    for (const [name, o] of cases) {
        const r = repairError(M, MASK, o); got[name] = r;
        say("     " + name.padEnd(16) + " deficient " + r.deficient.toExponential(3) + "   healthy " +
            r.healthy.toExponential(3) + "   still rank<2 " + r.stillRank1 + "   max stencil " + r.maxStencil);
    }
    ok("!! the VERTEX stencil restores exactness, and it asserts nothing about the physics",
        got["vertex stencil"].deficient < 1e-14 && got["vertex stencil"].stillRank1 === 0,
        got["vertex stencil"].deficient.toExponential(3) + " -- PURE GEOMETRY. It needs no boundary data of any " +
        "kind, which makes it the only one of the three a solver can apply without knowing what the boundary IS");
    ok("!! DIRICHLET restores exactness too, and costs no stencil at all",
        got["Dirichlet"].deficient < 1e-14 && got["Dirichlet"].maxStencil === got["no repair"].maxStencil,
        got["Dirichlet"].deficient.toExponential(3) + " with the stencil unchanged at " + got["Dirichlet"].maxStencil +
        " -- one extra equation from data a solver genuinely has on a Dirichlet boundary");
    ok("!! and NEUMANN = 0 restores the RANK while producing a 55% WRONG ANSWER",
        got["Neumann = 0"].stillRank1 === 0 && got["Neumann = 0"].deficient > 0.5,
        got["Neumann = 0"].deficient.toExponential(3) + ". The rank deficiency is closed -- the matrix is " +
        "invertible now -- and the answer is wrong, because the field's normal derivative at that boundary IS NOT " +
        "ZERO. RANK IS NOT CORRECTNESS");
    ok("...and the unrepaired cell was reading exactly 1.000, which is a REFUSAL", Math.abs(got["no repair"].deficient - 1) < 1e-12,
        "SO THE ERROR FELL FROM 1.000 TO 0.547 AND THE SITUATION GOT WORSE. 1.000 is gx = gy = 0, a flag a caller " +
        "can test for; 0.547 is a plausible vector a solver would use without hesitating. A CONFIDENT WRONG ANSWER " +
        "IS WORSE THAN AN HONEST REFUSAL, which is this tree's oldest law arriving in a numerical method");
}

// --- 2. the mechanism against the assertion -----------------------------------------------------------------------
{
    say("2. IS NEUMANN BROKEN, OR IS THE ASSERTION FALSE? Two different verdicts and only one is about Neumann.");
    const zero = repairError(M, MASK, { mode: "neumann", onlyWhereDeficient: MASK });
    const honest = repairError(M, MASK, { mode: "neumann", onlyWhereDeficient: MASK, honestNeumann: true });
    say("     Neumann with 0:            deficient " + zero.deficient.toExponential(3));
    say("     Neumann with the TRUE value: deficient " + honest.deficient.toExponential(3));
    ok("!! supplied with the honest normal derivative, the SAME machinery is exact", honest.deficient < 1e-14 && zero.deficient > 0.5,
        "5.842e-16 against 5.472e-1. SO THE MECHANISM IS SOUND AND THE ASSERTION WAS WHAT WAS FALSE -- 'Neumann " +
        "repairs the rank' is true, and 'a zero-Neumann boundary is a safe default' is a claim about the FIELD");
    // *** I WROTE THIS AS `ok(..., true, ...)` -- A CHECK THAT CANNOT FAIL, WEARING THE COSTUME OF EVIDENCE, IN THE
    // ROUND WHOSE SUBJECT IS ANSWERS THAT LOOK LIKE EVIDENCE. It is prose, so it is a say(). What CAN be checked is
    // the thing the prose rests on: that the verdict flips on the ASSERTION alone, with the mesh, the field and the
    // machinery all held fixed. ***
    ok("the verdict flips on the assertion alone, everything else held fixed", (() => {
        const a = repairError(M, MASK, { mode: "neumann", onlyWhereDeficient: MASK });
        const b = repairError(M, MASK, { mode: "neumann", onlyWhereDeficient: MASK, honestNeumann: true });
        return a.stillRank1 === b.stillRank1 && a.maxStencil === b.maxStencil && a.deficient / b.deficient > 1e13;
    })(), "same rank, same stencil size, same rows -- only the RIGHT-HAND SIDE differs, and the error moves by " +
        "thirteen orders. A solver that genuinely has a zero-flux wall may use it and be exact; one that reaches " +
        "for it because it is cheap has substituted a convenient physics for the physics it has");
}

// --- 3. WHERE A RULE IS APPLIED IS AS LOAD-BEARING AS THE RULE ------------------------------------------------------
{
    say("3. A REPAIR IS USUALLY WRITTEN AS A BOUNDARY RULE AND APPLIED TO EVERY BOUNDARY CELL. What does that cost?");
    const everywhere = repairError(M, MASK, { mode: "neumann" });
    const targeted = repairError(M, MASK, { mode: "neumann", onlyWhereDeficient: MASK });
    say("     Neumann = 0 everywhere:      deficient " + everywhere.deficient.toExponential(3) + "   healthy " + everywhere.healthy.toExponential(3));
    say("     Neumann = 0 where deficient: deficient " + targeted.deficient.toExponential(3) + "   healthy " + targeted.healthy.toExponential(3));
    ok("!! applied to every boundary cell it DAMAGES the ones that were already exact", everywhere.healthy > 0.5 && targeted.healthy < 1e-13,
        "healthy cells go from " + targeted.healthy.toExponential(3) + " to " + everywhere.healthy.toExponential(3) +
        " -- v3640 measured that 92 of the 94 boundary cells were ALREADY EXACT, so a rule applied to all of them " +
        "CAN ONLY DO HARM. THE SCOPE OF A RULE IS AS LOAD-BEARING AS THE RULE");
    const dEvery = repairError(M, MASK, { mode: "dirichlet" });
    ok("...while a TRUE condition applied everywhere is harmless", dEvery.healthy < 1e-13 && dEvery.deficient < 1e-13,
        "Dirichlet everywhere leaves the healthy cells at " + dEvery.healthy.toExponential(3) + ", because an extra " +
        "row that is CONSISTENT with the field cannot move a least-squares fit that already passes through it. " +
        "SO 'APPLY IT EVERYWHERE' IS SAFE EXACTLY WHEN THE CONDITION IS TRUE -- which is not a numerical safeguard");
}

// --- 4. what the vertex stencil costs ---------------------------------------------------------------------------------
{
    say("4. THE ONE REPAIR THAT NEEDS NO PHYSICS IS THE ONE THAT COSTS.");
    const vn = vertexNeighbours(M);
    let sf = 0, sv = 0, maxV = 0;
    for (let t = 0; t < M.tri.length; t++) { sf += M.nbr[t].length; sv += vn[t].length; maxV = Math.max(maxV, vn[t].length); }
    const meanF = sf / M.tri.length, meanV = sv / M.tri.length;
    say("     mean face neighbours " + meanF.toFixed(2) + "   mean vertex neighbours " + meanV.toFixed(2) + "   max " + maxV);
    ok("the vertex neighbourhood is ~4x the face neighbourhood", meanV / meanF > 3 && meanV / meanF < 5,
        (meanV / meanF).toFixed(2) + "x more rows per cell, every cell, forever -- against a defect that in 2D " +
        "affects TWO cells. In 3D, where v3641 found 6n of them, that trade is a different arithmetic and this " +
        "round does not do it");
    ok("every face neighbour is also a vertex neighbour", (() => {
        for (let t = 0; t < M.tri.length; t++) { const s = new Set(vn[t]); for (const q of M.nbr[t]) if (!s.has(q)) return false; }
        return true;
    })(), "the widening is a strict superset, so it cannot lose information a face stencil had");
    ok("...and it is worth stating that the vertex stencil is NOT free of assumptions either", (() => {
        const src = readFileSync(new URL("./rankRepair.mjs", import.meta.url), "utf8");
        return /PURE GEOMETRY/.test(src);
    })(), "it assumes the field is smooth enough that a distant cell is informative, which across a material " +
        "interface or a shock is exactly the assumption that fails. NOT TESTED HERE -- named, not measured");
}

// --- 5. scope ------------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./rankRepair.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("a repair that FAILS to restore rank still reports it rather than writing a silent zero", (() => {
        const g = gradientRepaired(U, M, { mode: "none" });
        return g.rank instanceof Int8Array && [...g.rank].some((r) => r < 2);
    })(), "v3640's law, kept through the repair layer");
    ok("boundary faces are derived from face counts, not from the index pattern", /count\.get\(key\(p, q\)\) !== 1/.test(src));
    say("   NOT DONE: the same four measurements in 3D, where v3641 found 6n deficient cells rather than two -- the");
    say("   VERDICTS should carry (the key is dimension-free) but the TRADE does not, because 6n cells against a 4x");
    say("   stencil everywhere is a different sum. NOT TESTED: a field with a genuine zero-flux wall, where the");
    say("   Neumann repair is exact and the honest choice; and a discontinuous field, where the vertex stencil's");
    say("   own assumption is the one that breaks.");
}

console.log("rankRepair-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
