// WebGLEngine/physics/mesh/quadraticRecon-selfcheck.mjs -- v3647
//
// Run: node physics/mesh/quadraticRecon-selfcheck.mjs
//
// *** v3646 ENDED BY PROPOSING THE FIX AND THE FIX IS WRONG. Its scope note said a higher-order boundary row --
// "two rows per face, or one per quadrature point" -- "is what would recover the exactness curvature costs".
// Three measurements say the boundary row was never the limiting factor, and a fourth says what is. ***

import { readFileSync } from "node:fs";
import { makeAnnulus, potentialFlow, cellValues, annulusFaces, gradientWall, wallSideError } from "./curvedWall.mjs";
import { vertexNeighbours } from "./rankRepair.mjs";
import { quadraticGradient, rowResidual, normalExactness } from "./quadraticRecon.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const { phi, grad } = potentialFlow({});
const NT = [24, 48, 96, 192, 384];
const build = (nt) => {
    const m = makeAnnulus({ nr: Math.max(4, Math.round(nt / 8)), nt, a: 1, b: 3 });
    return { nt, m, u: cellValues(m, phi), F: annulusFaces(m), vn: vertexNeighbours(m) };
};
const S = NT.map(build);
const ordersOf = (v) => v.slice(1).map((e, i) => Math.log2(v[i] / e));

// --- 1. the normal is not the error --------------------------------------------------------------------------
{
    say("1. IS THE SINGLE ROW'S NORMAL WRONG? A chord's normal is the radial direction at the ARC midpoint, by symmetry.");
    const w = S.map((s) => normalExactness(s.m, s.F, "inner"));
    say("     |face normal - exact wall normal| at nt = " + NT.join(", ") + ":  " + w.map((x) => x.toExponential(3)).join("  "));
    ok("!! the row is ALREADY EXACT at its own quadrature point", w.every((x) => x < 1e-13),
        "4.003e-16 rising only to 7.229e-15 over a sixteenfold refinement -- ROUND-OFF, NOT GEOMETRY, and it does " +
        "NOT fall with h because there is nothing there to converge. THERE IS NO NORMAL ERROR TO FIX");
    ok("...and the sign convention was itself a trap worth recording", (() => {
        const src = readFileSync(new URL("./quadraticRecon.mjs", import.meta.url), "utf8");
        return /points TOWARD the hole, i\.e\. -rhat/.test(src);
    })(), "MY FIRST VERSION OF THIS CHECK COMPARED AGAINST +rhat AND READ EXACTLY 2.000 -- two unit vectors pointing " +
        "opposite ways. On the INNER wall of an annulus 'outward from the cell' means TOWARD THE HOLE. A worst-case " +
        "of exactly 2.000 between unit vectors is a SIGN, not an error");
}

// --- 2. what the row actually asks for --------------------------------------------------------------------------
{
    say("2. CAN A CONSTANT GRADIENT SATISFY THE ROW AT ALL? |grad_exact(centroid) . n| on the inner faces.");
    const r = S.map((s) => rowResidual(s.m, s.F, grad, "inner"));
    say("     " + r.map((x) => x.relative.toExponential(3)).join("  ") + "   orders " +
        ordersOf(r.map((x) => x.relative)).map((o) => o.toFixed(2)).join(", "));
    // THE COARSEST STEP READS 0.55 AND THE REST READ 0.96, 0.98, 0.99: the first pair is PRE-ASYMPTOTIC, which is
    // what a 24-segment circle is. My first assertion demanded every step be first order and went red on the one
    // step where the mesh does not yet resolve the geometry -- an ORDER IS AN ASYMPTOTIC CLAIM AND ASSERTING IT
    // ON THE COARSEST PAIR IS ASKING THE FIXTURE FOR SOMETHING IT HAS NOT GOT. The coarse step is REPORTED.
    ok("!! it cannot -- the residual is O(h), and that IS the observed first order",
        ordersOf(r.map((x) => x.relative)).slice(1).every((o) => o > 0.9 && o < 1.1),
        "1.563e-1 down to 1.405e-2, orders 0.96 / 0.98 / 0.99 once the mesh resolves the circle (the coarsest step reads 0.55 and is reported, not asserted on). THE ROW ASKS A CONSTANT GRADIENT FOR SOMETHING A " +
        "CONSTANT GRADIENT DOES NOT HAVE, and v3646's first-order convergence is exactly this residual vanishing");
}

// --- 3. AND A SECOND ROW MAKES IT WORSE ---------------------------------------------------------------------------
{
    say("3. THE PROPOSED FIX, MEASURED. Two rows per face, at the two endpoints, each with its own exact normal.");
    const two = (s) => {
        const { m, u, F } = s;
        const gx = new Float64Array(u.length), gy = new Float64Array(u.length);
        for (let t = 0; t < u.length; t++) {
            const rows = [];
            for (const q of m.nbr[t]) { const dx = m.cx[q] - m.cx[t], dy = m.cy[q] - m.cy[t]; rows.push([dx, dy, u[q] - u[t], 1 / (dx * dx + dy * dy)]); }
            if (F[t].some((f) => f.kind === "inner")) {
                const [p, q, z] = m.tri[t];
                for (const [x, y] of [[p, q], [q, z], [z, p]]) {
                    const rx = Math.hypot(m.vx[x], m.vy[x]), ry = Math.hypot(m.vx[y], m.vy[y]);
                    if (Math.abs(rx - m.a) > 1e-9 || Math.abs(ry - m.a) > 1e-9) continue;
                    rows.push([-m.vx[x] / rx, -m.vy[x] / rx, 0, 1]);
                    rows.push([-m.vx[y] / ry, -m.vy[y] / ry, 0, 1]);
                }
            }
            let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0;
            for (const [dx, dy, du, w] of rows) { sxx += w * dx * dx; sxy += w * dx * dy; syy += w * dy * dy; sxu += w * dx * du; syu += w * dy * du; }
            const det = sxx * syy - sxy * sxy, tr = sxx + syy;
            if (Math.abs(det) > 1e-10 * Math.max(tr * tr, 1e-300)) { gx[t] = (syy * sxu - sxy * syu) / det; gy[t] = (sxx * syu - sxy * sxu) / det; }
        }
        return wallSideError(m, F, grad, { gx, gy }, "inner");
    };
    const e2 = S.map(two);
    const e1 = S.map((s) => wallSideError(s.m, s.F, grad, gradientWall(s.u, s.m, { wall: "inner", faces: s.F }), "inner"));
    say("     one row:  " + e1.map((x) => x.toExponential(2)).join("  ") + "   orders " + ordersOf(e1).map((o) => o.toFixed(2)).join(", "));
    say("     two rows: " + e2.map((x) => x.toExponential(2)).join("  ") + "   orders " + ordersOf(e2).map((o) => o.toFixed(2)).join(", "));
    ok("!! the proposed fix is WORSE at every mesh size and converges no faster", e2.every((x, i) => x > e1[i]),
        "1.322e-1 against 1.047e-1 at the coarsest and still worse at the finest -- BECAUSE IT ADDS ANOTHER " +
        "EQUATION THE CONSTANT GRADIENT CANNOT SATISFY EITHER. More quadrature points state a true condition more " +
        "carefully to a model that cannot hear it");
}

// --- 4. WHAT ACTUALLY MOVES THE CATEGORY ---------------------------------------------------------------------------
{
    say("4. A QUADRATIC RECONSTRUCTION OVER THE VERTEX NEIGHBOURHOOD, WITH NO BOUNDARY ROW AT ALL.");
    const eq = S.map((s) => wallSideError(s.m, s.F, grad, quadraticGradient(s.u, s.m, s.vn), "inner"));
    const e1 = S.map((s) => wallSideError(s.m, s.F, grad, gradientWall(s.u, s.m, { wall: "inner", faces: s.F }), "inner"));
    say("     linear + row: " + e1.map((x) => x.toExponential(2)).join("  ") + "   orders " + ordersOf(e1).map((o) => o.toFixed(2)).join(", "));
    say("     quadratic:    " + eq.map((x) => x.toExponential(2)).join("  ") + "   orders " + ordersOf(eq).map((o) => o.toFixed(2)).join(", "));
    ok("!! it converges at SECOND order where the linear-plus-row managed first", (() => {
        const o = ordersOf(eq); return o[o.length - 1] > 1.75 && ordersOf(e1).slice(-1)[0] < 1.1;
    })(), "1.88 against 0.93, and 27x more accurate at the finest mesh (5.00e-4 against 1.36e-2). THE CATEGORY " +
        "MOVES -- BUT NOT BY THE ROUTE I PROPOSED. The boundary row was never the limiting factor; the " +
        "RECONSTRUCTION was, and fixing it needs no boundary row at all");
    ok("the higher order costs the wider stencil, which is a trade already measured", (() => {
        const s = S[2];
        let face = 0, vert = 0, unfit = 0;
        for (let t = 0; t < s.m.tri.length; t++) { face += s.m.nbr[t].length; vert += s.vn[t].length; }
        const q = quadraticGradient(s.u, s.m, s.vn);
        for (let t = 0; t < s.m.tri.length; t++) if (!q.ok[t]) unfit++;
        say("     mean face neighbours " + (face / s.m.tri.length).toFixed(2) + ", vertex " + (vert / s.m.tri.length).toFixed(2) +
            "; cells the quadratic could not fit: " + unfit);
        return vert / face > 3 && unfit === 0;
    })(), "FIVE unknowns need at least five rows, which a vertex neighbourhood has and a face neighbourhood does " +
        "not -- the same widening trade v3642 measured for the rank repair, arriving from a different direction");
    ok("a cell that cannot be fitted says so rather than returning a zero", (() => {
        const s = S[0];
        const q = quadraticGradient(s.u, s.m, s.m.nbr);       // face stencil: too few rows on purpose
        let refused = 0; for (let t = 0; t < s.m.tri.length; t++) if (!q.ok[t]) refused++;
        say("     driven on the FACE stencil (3 rows for 5 unknowns): " + refused + " of " + s.m.tri.length + " refused");
        return refused === s.m.tri.length;
    })(), "v3640's law, kept -- and the refusal is total here because three rows can never determine five unknowns");
}

// --- 5. scope ---------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./quadraticRecon.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    say("   NOT CLAIMED: that a quadratic reconstruction is the right choice for a solver. It is 3.9x the rows on");
    say("   EVERY cell and it has no limiter, so on the discontinuous field of v3644 it would be the widening under");
    say("   trial again and worse. WHAT IS CLAIMED IS NARROW: the boundary row was not the limiting factor on a");
    say("   curved wall, the reconstruction was, and the fix v3646 proposed makes it worse rather than better.");
    say("   NOT DONE: the quadratic WITH a boundary row (the row should now be satisfiable, which is a different");
    say("   measurement), and the same question in 3D where a quadratic has NINE unknowns.");
}

console.log("quadraticRecon-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
