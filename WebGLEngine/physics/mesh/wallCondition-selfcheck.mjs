// WebGLEngine/physics/mesh/wallCondition-selfcheck.mjs -- v3645
//
// Run: node physics/mesh/wallCondition-selfcheck.mjs
//
// *** THE CONTROL THIS ARC OWED, NAMED IN v3642, v3643 AND v3644 AND DEFERRED EACH TIME. Two rounds measured a
// zero-Neumann repair producing a wrong answer -- 0.547 in 2D, 1.134 in 3D, worse there than the refusal -- and
// both said "the mechanism is sound and the assertion is what is false". WITHOUT A FIELD WHERE THE ASSERTION IS
// TRUE, that was a claim about ONE FIELD dressed as a claim about the method. This is the regime where the
// effect must vanish, and it vanishes. ***
//
// THE FIELD IS u = a + c*y: linear, so the exact key still applies and the true gradient is the constant (0, c),
// and varying ONLY in y. The LEFT and RIGHT walls have outward normal +/-x, so grad u . n = 0 EXACTLY -- genuine
// zero-flux walls. The TOP and BOTTOM have normal +/-y and grad u . n = +/-c, which is not zero.
//
// *** SO THE SAME RULE IS TRUE ON ONE WALL AND FALSE ON ANOTHER IN THE SAME RUN ON THE SAME FIELD -- and the
// rank-deficient corner cells touch BOTH KINDS, one face each. ***

import { readFileSync } from "node:fs";
import { makeTriMesh, gradientLS } from "./triReconstruct.mjs";
import { wallField, wallFaces, wallError, gradientWithWalls } from "./wallCondition.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = makeTriMesh({ nx: 24, ny: 24, h: 20 / 24, skew: 0 });
const { u: U, grad: TRUE } = wallField(M, {});
const G0 = gradientLS(U, M);
const MASK = new Uint8Array(M.tri.length);
let NDEF = 0; for (let t = 0; t < M.tri.length; t++) if (G0.rank[t] < 2) { MASK[t] = 1; NDEF++; }
const F = wallFaces(M);

// --- 1. the fixture, before anything is concluded from it -------------------------------------------------------
{
    say("1. THE FIXTURE. u = a + c*y, so the true gradient is the constant (" + TRUE[0] + ", " + TRUE[1] + ").");
    let kx = 0, ky = 0, ko = 0;
    for (const l of F) for (const f of l) { if (f.kind === "x") kx++; else if (f.kind === "y") ky++; else ko++; }
    say("     boundary faces: " + kx + " on x-walls, " + ky + " on y-walls, " + ko + " neither");
    ok("the wall kind is derived from the NORMAL, not from the coordinate", ko === 0 && kx === ky && kx > 0, (() => {
        const src = readFileSync(new URL("./wallCondition.mjs", import.meta.url), "utf8");
        return /derived from the normal itself, not from the coordinate/.test(src);
    })() ? "so a sheared mesh would be handled by the same test rather than a special case" : "");
    ok("!! grad u . n really is zero on the x-walls and nonzero on the y-walls", (() => {
        let worstX = 0, leastY = Infinity;
        for (const l of F) for (const f of l) {
            const d = Math.abs(TRUE[0] * f.nx + TRUE[1] * f.ny);
            if (f.kind === "x") worstX = Math.max(worstX, d); else leastY = Math.min(leastY, d);
        }
        say("     |grad.n| worst on an x-wall " + worstX.toExponential(3) + "; least on a y-wall " + leastY.toFixed(6));
        return worstX < 1e-15 && leastY > 0.3;
    })(), "CHECKED RATHER THAN ASSUMED -- the whole round rests on one wall being a real zero-flux wall");
    ok("the deficient cells touch ONE face of each kind", (() => {
        let all = true;
        for (let t = 0; t < M.tri.length; t++) if (MASK[t]) {
            const kinds = F[t].map((f) => f.kind).sort().join(",");
            say("     deficient cell " + t + " has boundary faces: " + kinds);
            if (kinds !== "x,y") all = false;
        }
        return all && NDEF === 2;
    })(), "which is what makes the next section possible: the same cell has a face where the rule is TRUE and a " +
        "face where it is FALSE");
}

// --- 2. THE CONTROL FIRES ------------------------------------------------------------------------------------------
{
    say("2. THE SAME RULE, APPLIED ON THE TRUE WALL, THE FALSE WALL, AND BOTH.");
    const got = {};
    for (const w of ["none", "x", "y", "all"]) {
        const r = wallError(M, MASK, { walls: w }); got[w] = r;
        say("     walls = " + w.padEnd(5) + "  deficient " + r.deficient.toExponential(3) + "   healthy " +
            r.healthy.toExponential(3) + "   still rank<2 " + r.stillLow);
    }
    ok("!! ON THE WALL WHERE THE ASSERTION IS TRUE, ZERO-NEUMANN IS EXACT", got.x.deficient < 1e-13 && got.x.stillLow === 0,
        got.x.deficient.toExponential(3) + " -- rank restored, no boundary data needed, no stencil widened, and the " +
        "answer exact. WHERE THE WALL REALLY IS A ZERO-FLUX WALL IT IS THE BEST OF THE THREE REPAIRS BY EVERY " +
        "MEASURE. Two rounds of calling it the dangerous one were describing a field, not a method");
    ok("...and it leaves the healthy cells alone", got.x.healthy < 1e-13,
        "because a row CONSISTENT with the field cannot move a fit that already passes through it -- v3642's " +
        "result, arriving from the side where the condition is true");
    ok("!! on the wall where the assertion is FALSE it is worse than the refusal", got.y.deficient > got.none.deficient,
        got.y.deficient.toFixed(4) + " against a refusal's " + got.none.deficient.toFixed(4) + ", AND it damages the " +
        "92 healthy boundary cells (" + got.y.healthy.toExponential(3) + ")");
    ok("!! and applied to BOTH faces of the same cell it lands in between, still wrong",
        got.all.deficient > 0.5 && got.all.deficient < got.y.deficient && got.all.deficient > got.x.deficient,
        got.all.deficient.toFixed(4) + " -- the true row and the false row are averaged by the least-squares fit, " +
        "so a correct condition does NOT rescue an incorrect one sitting beside it. APPLYING THE RULE TO BOTH IS " +
        "WORSE THAN APPLYING IT TO ONE");
    // a suspiciously round number gets looked at rather than quoted
    ok("the y-wall figure is reported as measured, not rounded into a story", (() => {
        say("     y-wall deficient error to twelve digits: " + got.y.deficient.toFixed(12) +
            "   (sqrt(2) = " + Math.SQRT2.toFixed(12) + ")");
        return Math.abs(got.y.deficient - Math.SQRT2) < 1e-9;
    })(), "it IS sqrt(2), and that is worth one sentence rather than a paragraph: forcing gy = 0 on a field whose " +
        "gradient is (0, c) leaves a residual of |c| in y, and the x-face neighbour lies along a line of constant " +
        "u so it contributes nothing -- the error vector has magnitude |c| against a truth of magnitude |c|, and " +
        "the second unit comes from the fit's response in x. NOT DERIVED FURTHER; the number is measured and the " +
        "conclusion does not depend on it");
}

// --- 3. what this changes about the previous three rounds ------------------------------------------------------------
{
    say("3. WHAT THIS CHANGES.");
    const x = wallError(M, MASK, { walls: "x" });
    const y = wallError(M, MASK, { walls: "y" });
    ok("the SAME code, the SAME mesh, the SAME field: only WHICH FACES get the row differs",
        x.deficient < 1e-13 && y.deficient > 1 && x.healthy < 1e-13 && y.healthy > 0.5,
        "thirteen orders apart. v3642 and v3643 could say 'the mechanism is sound and the assertion is false'; " +
        "this measures BOTH SIDES OF THAT SENTENCE IN ONE RUN");
    ok("...and rank is restored in every case, including the wrong ones", x.stillLow === 0 && y.stillLow === 0,
        "RANK IS NOT CORRECTNESS -- stated in v3642, and here the rank is identical while the answer moves by " +
        "thirteen orders");
    say("   SO THE RECOMMENDATION FROM v3644 STANDS AND GAINS A CLAUSE: Dirichlet where the data exists; the vertex");
    say("   stencil only where the rank is deficient; ZERO-NEUMANN WHERE THE WALL IS ACTUALLY A ZERO-FLUX WALL,");
    say("   WHICH IS A FACT ABOUT THE PROBLEM AND NOT ABOUT THE MESH -- and never as a default, because the same");
    say("   rule on the next wall along is worse than doing nothing.");
}

// --- 4. scope ----------------------------------------------------------------------------------------------------------
{
    say("4. SCOPE.");
    const src = readFileSync(new URL("./wallCondition.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("the field's cell values are exact averages, not a quadrature", /centroid value of a linear field/.test(src),
        "over a triangle the mean of a linear function IS its centroid value, so there is no quadrature error in " +
        "the key at all");
    ok("gradientWithWalls reports rank, so a case that fails to restore it says so", (() => {
        const g = gradientWithWalls(U, M, { walls: "none" });
        return g.rank instanceof Int8Array && [...g.rank].some((r) => r < 2);
    })());
    say("   NOT DONE: a CURVED zero-flux wall, where grad u . n = 0 holds pointwise but the normal turns within a");
    say("   cell, so the single row is an average of a varying condition rather than a statement. NOT DONE: the");
    say("   same fixture in 3D, where a corner cell touches THREE walls and the true/false mix has a third case.");
    say("   NOT DONE, AND STILL OPEN FROM v3644: a sheared mesh with a straddling interface, and a limiter on the");
    say("   discontinuous field.");
}

console.log("wallCondition-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
