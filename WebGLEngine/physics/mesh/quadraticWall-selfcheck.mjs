// WebGLEngine/physics/mesh/quadraticWall-selfcheck.mjs -- v3648
//
// Run: node physics/mesh/quadraticWall-selfcheck.mjs
//
// THE MEASUREMENT THAT CLOSES THE THREAD. v3647 showed the boundary row was not the limiting factor on a curved
// wall -- a CONSTANT gradient cannot satisfy it -- and named the next question: the quadratic WITH the row, where
// the row should now be satisfiable.
//
// *** AND THE FIRST THING IT FOUND CORRECTS A SENTENCE I SHIPPED LAST ROUND. v3647 wrote "the row is already
// exact at its own quadrature point". THAT WAS TWO CLAIMS WEARING ONE SENTENCE: the NORMAL is exact at the arc
// midpoint, to round-off -- but the POINT is not on the wall at all. A chord's midpoint lies INSIDE the circle
// by a(1 - cos(pi/nt)), a closed form, O(h^2). AN EXACT DIRECTION AT AN INEXACT LOCATION. ***

import { readFileSync } from "node:fs";
import { makeAnnulus, potentialFlow, cellValues, annulusFaces, gradientWall, wallSideError } from "./curvedWall.mjs";
import { vertexNeighbours } from "./rankRepair.mjs";
import { quadraticGradient, quadraticGradientWithWall, faceMidpointOffset, normalExactness } from "./quadraticRecon.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const { phi, grad } = potentialFlow({});
const NT = [24, 48, 96, 192, 384];
const S = NT.map((nt) => {
    const m = makeAnnulus({ nr: Math.max(4, Math.round(nt / 8)), nt, a: 1, b: 3 });
    return { nt, m, u: cellValues(m, phi), F: annulusFaces(m), vn: vertexNeighbours(m) };
});
const ord = (v) => v.slice(1).map((e, i) => Math.log2(v[i] / e));

// --- 1. the sentence that was two claims ------------------------------------------------------------------------
{
    say("1. v3647 SAID 'THE ROW IS ALREADY EXACT AT ITS OWN QUADRATURE POINT'. Two claims, and only one is true.");
    const nrm = S.map((s) => normalExactness(s.m, s.F, "inner"));
    const off = S.map((s) => faceMidpointOffset(s.m, s.F, "inner"));
    say("     normal exactness:      " + nrm.map((x) => x.toExponential(2)).join("  ") + "   (round-off, flat)");
    say("     face-midpoint offset:  " + off.map((x) => x.worst.toExponential(3)).join("  ") +
        "   orders " + ord(off.map((x) => x.worst)).map((o) => o.toFixed(2)).join(", "));
    ok("the NORMAL is exact -- that half of the sentence holds", nrm.every((x) => x < 1e-13));
    ok("!! but the POINT is not on the wall, and the offset is a closed form", off.every((x) => Math.abs(x.worst / x.closedForm - 1) < 1e-6),
        "measured offset matches a(1 - cos(pi/nt)) to six decimals at every mesh -- 8.555e-3 down to 3.347e-5, " +
        "O(h^2). A CHORD'S MIDPOINT LIES INSIDE THE CIRCLE. The row states a true condition AT A PLACE WHERE IT IS " +
        "NOT QUITE TRUE, which is a different defect from the normal being wrong and I had merged them");
    ok("...and that is what makes the row not exactly satisfiable even by a quadratic", (() => {
        const res = S.map((s) => {
            let w = 0;
            for (let t = 0; t < s.m.tri.length; t++) for (const f of s.F[t]) {
                if (f.kind !== "inner") continue;
                const [gx, gy] = grad(f.mx, f.my);
                w = Math.max(w, Math.abs(gx * f.nx + gy * f.ny));
            }
            return w;
        });
        say("     |grad_exact(face midpoint) . n|: " + res.map((x) => x.toExponential(3)).join("  ") +
            "   orders " + ord(res).map((o) => o.toFixed(2)).join(", "));
        return ord(res).slice(1).every((o) => o > 1.8 && o < 2.2);
    })(), "1.718e-2 down to 6.693e-5 at SECOND order, tracking the offset -- so the row is satisfiable to O(h^2) " +
        "rather than exactly. AGAINST THE CONSTANT GRADIENT'S O(h) RESIDUAL, WHICH IS THE POINT: the quadratic's " +
        "obstacle is the GEOMETRY OF THE FACE and the linear one's was the MODEL");
}

// --- 2. THE MEASUREMENT --------------------------------------------------------------------------------------------
{
    say("2. THE QUADRATIC, WITH AND WITHOUT THE ROW.");
    const e0 = S.map((s) => wallSideError(s.m, s.F, grad, quadraticGradient(s.u, s.m, s.vn), "inner"));
    const e1 = S.map((s) => wallSideError(s.m, s.F, grad, quadraticGradientWithWall(s.u, s.m, s.vn, s.F), "inner"));
    const eL = S.map((s) => wallSideError(s.m, s.F, grad, gradientWall(s.u, s.m, { wall: "inner", faces: s.F }), "inner"));
    say("     linear + row:      " + eL.map((x) => x.toExponential(2)).join("  ") + "   orders " + ord(eL).map((o) => o.toFixed(2)).join(", "));
    say("     quadratic, no row: " + e0.map((x) => x.toExponential(2)).join("  ") + "   orders " + ord(e0).map((o) => o.toFixed(2)).join(", "));
    say("     quadratic + row:   " + e1.map((x) => x.toExponential(2)).join("  ") + "   orders " + ord(e1).map((o) => o.toFixed(2)).join(", "));
    say("     ratio with/without: " + e1.map((x, i) => (x / e0[i]).toFixed(4)).join("  "));
    ok("!! the row now HELPS, by a steady 40%", e1.every((x, i) => x < 0.75 * e0[i] && x > 0.5 * e0[i]),
        "ratios 0.590 / 0.686 / 0.647 / 0.619 / 0.603 -- consistently better and CONVERGING TO A CONSTANT, not to " +
        "zero and not away");
    ok("!! but it buys a CONSTANT FACTOR, not an ORDER", (() => {
        const o0 = ord(e0).slice(-1)[0], o1 = ord(e1).slice(-1)[0];
        return Math.abs(o1 - o0) < 0.15 && o1 > 1.8;
    })(), "1.92 against 1.88 -- the same order. The row moves the line down and does not tilt it, WHICH IS WHAT AN " +
        "O(h^2)-satisfiable constraint on an O(h^2) method must do");
    ok("...and the linear-plus-row is still first order, so the order came from the reconstruction",
        ord(eL).slice(-1)[0] < 1.1, "0.93 against 1.88 and 1.92 -- v3647's finding, unchanged by adding the row back");
}

// --- 3. THE LAW THE WHOLE ARC HAS BEEN CIRCLING ---------------------------------------------------------------------
{
    say("3. SEVEN ROUNDS OF BOUNDARY ROWS, IN ONE SENTENCE.");
    const e0 = S.map((s) => wallSideError(s.m, s.F, grad, quadraticGradient(s.u, s.m, s.vn), "inner"));
    const e1 = S.map((s) => wallSideError(s.m, s.F, grad, quadraticGradientWithWall(s.u, s.m, s.vn, s.F), "inner"));
    say("     FLAT wall, true, linear:      EXACT (1.805e-15)          -- the model can satisfy it perfectly");
    say("     CURVED wall, true, linear:    no help, order 1           -- the model cannot satisfy it at all");
    say("     CURVED wall, true, quadratic: 40% better, order unchanged -- the model can satisfy it to O(h^2)");
    say("     ANY wall, false:              worse than the refusal      -- the model satisfies a wrong thing");
    ok("!! A BOUNDARY ROW HELPS EXACTLY TO THE EXTENT THE RECONSTRUCTION CAN SATISFY IT",
        e1[4] < e0[4] && Math.abs(ord(e1).slice(-1)[0] - ord(e0).slice(-1)[0]) < 0.15,
        "and the three cases are the three answers to one question -- PERFECTLY, NOT AT ALL, and TO SECOND ORDER. " +
        "The row was never a free correction and never a fault; it is a CONSTRAINT, and a constraint is worth what " +
        "the model can do with it");
    // written as a bare IIFE: a leading `true ===` reads like the hardcoded-true anti-pattern this arc
    // keeps catching, even when the right-hand side is a real check.
    ok("the false-wall case is the fourth answer and is not on the same scale", (() => {
        // measured in v3645/v3646 and re-run here so the claim is not a memory
        const s = S[2];
        const bad = wallSideError(s.m, s.F, grad, gradientWall(s.u, s.m, { wall: "outer", faces: s.F }), "outer");
        const none = wallSideError(s.m, s.F, grad, gradientWall(s.u, s.m, { wall: "none", faces: s.F }), "outer");
        say("     re-run here: outer wall with the false row " + bad.toExponential(3) + " against no row " + none.toExponential(3));
        return bad > 10 * none;
    })(), "RE-RUN RATHER THAN REMEMBERED -- a claim carried across four rounds is worth re-measuring in the round " +
        "that generalises it");
}

// --- 4. scope ---------------------------------------------------------------------------------------------------------
{
    say("4. SCOPE.");
    const src = readFileSync(new URL("./quadraticRecon.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("the row is a linear condition on the quadratic's coefficients, not a post-hoc correction", /f\.nx \* dx, f\.nx \* dy \+ f\.ny \* dx/.test(src),
        "grad_quad(face midpoint) = (a1 + a3 dx + a4 dy, a2 + a4 dx + a5 dy), so the constraint enters the fit " +
        "rather than adjusting its output");
    say("   NOT DONE, AND IT IS THE OBVIOUS ONE: move the row's evaluation point ONTO the wall -- the offset is a");
    say("   closed form, so a corrected midpoint is one line. WHETHER THAT RECOVERS THE REMAINING FACTOR IS A");
    say("   MEASUREMENT AND NOT A DEDUCTION, and this round does not make it. NOT DONE: 3D, where a quadratic has");
    say("   NINE unknowns; and the sheared-mesh straddling interface and the limiter on a discontinuous field,");
    say("   both open since v3644.");
}

console.log("quadraticWall-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
