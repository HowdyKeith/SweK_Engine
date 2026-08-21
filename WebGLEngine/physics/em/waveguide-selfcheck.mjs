// WebGLEngine/physics/em/waveguide-selfcheck.mjs — v3408
//
// Run: node physics/em/waveguide-selfcheck.mjs   (~1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// A hollow metal pipe carries NOTHING below its cutoff, and above it carries a discrete set of modes. Both come
// from one 2D eigenproblem on the cross-section, with the exact answer kc = pi sqrt((m/a)^2 + (n/b)^2).
//
// *** TE AND TM DIFFER ONLY IN A BOUNDARY CONDITION, AND THAT DIFFERENCE DECIDES WHICH MODE IS DOMINANT. *** Ez
// must vanish on a conductor (Dirichlet, so TM needs m,n >= 1 -- there is no TM10) while Hz has a vanishing
// normal derivative (Neumann, so TE allows a zero index -- and TE10 is the mode every rectangular guide is
// designed around). The numbers alone would not catch a solver that swapped them: it returns a tidy list of
// plausible frequencies for a pipe that does not exist. The MODE SET is what catches it.
//
// AND THE SOLVER DOES NOT KNOW THE ANSWER SEPARATES. The rectangle's eigenvalues split into an x part and a y
// part, and the exact formula is built from that; this assembles the FULL 2D Laplacian and diagonalises it, so
// agreement is a result rather than a restatement of the method.

import { C_DEFINED } from "./maxwell.mjs";
import { cutoffK, cutoffFrequency, exactModes, laplacian2D, measureCutoffs } from "./waveguide.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const a = 2, b = 1;                                   // the standard 2:1 guide

// ---- 1. THE DOMINANT MODE IS TE10 AT pi/a, AND IT CONVERGES AT SECOND ORDER --------------------------------------
{
    const rows = [[16, 8], [24, 12], [32, 16]].map(([nx, ny]) => {
        const r = measureCutoffs({ kind: "TE", nx, ny, a, b, count: 1 });
        return { nx, k: r.ks[0], rel: Math.abs(r.ks[0] - Math.PI / a) / (Math.PI / a) };
    });
    ok("!! the lowest TE cutoff is pi/a = " + (Math.PI / a).toFixed(6) + ", the mode every rectangular guide is designed around",
       rows[2].rel < 1e-3,
       rows.map((r) => "nx=" + r.nx + ": " + r.k.toFixed(6)).join(", ") + " — relative " + rows[2].rel.toExponential(2) + " at nx=32");
    // nx goes 16 -> 24 -> 32, so h falls by 1.5 then 1.333; a second-order scheme owes 2.25 and 1.78
    const r1 = rows[0].rel / rows[1].rel, r2 = rows[1].rel / rows[2].rel;
    ok("!! ...and the error falls as h^2 (2.25 and 1.78 for grid ratios 1.5 and 1.333)",
       Math.abs(r1 - 2.25) < 0.3 && Math.abs(r2 - 1.78) < 0.25,
       "measured " + r1.toFixed(2) + " and " + r2.toFixed(2) + " — second order, so what remains is discretisation");
}

// ---- 2. THE TWO FAMILIES HAVE DIFFERENT MODE SETS, WHICH IS THE BOUNDARY CONDITION SHOWING ---------------------------
{
    const te = measureCutoffs({ kind: "TE", nx: 32, ny: 16, a, b, count: 4 });
    const tm = measureCutoffs({ kind: "TM", nx: 32, ny: 16, a, b, count: 4 });
    ok("!! TM has NO mode with a zero index — its lowest is TM11, not TM10",
       tm.modes[0].m === 1 && tm.modes[0].n === 1,
       "lowest TM is (" + tm.modes[0].m + "," + tm.modes[0].n + ") — Ez must vanish on the wall, and a mode constant along one axis cannot");
    ok("!! ...while TE's lowest DOES have one, and that is why the guide works at all",
       te.modes[0].m === 1 && te.modes[0].n === 0,
       "lowest TE is (" + te.modes[0].m + "," + te.modes[0].n + ")");
    const ratio = tm.ks[0] / te.ks[0];
    ok("!! the TM cutoff sits at exactly sqrt(5) times the TE cutoff for a 2:1 guide",
       Math.abs(ratio - Math.sqrt(5)) / Math.sqrt(5) < 2e-3,
       "measured " + ratio.toFixed(5) + " against " + Math.sqrt(5).toFixed(5) +
       " — an irrational ratio fixed entirely by the aspect ratio and the boundary conditions");
}

// ---- 3. THE CONSTANT MODE IS EXACTLY ZERO, AND IS DROPPED BY NAME RATHER THAN BY A TOLERANCE --------------------------
{
    const te = measureCutoffs({ kind: "TE", nx: 24, ny: 12, a, b, count: 2 });
    ok("!! the Neumann problem carries one eigenvalue that is ZERO because a constant has no curvature",
       Math.abs(te.dropped) < 1e-9,
       "dropped eigenvalue " + te.dropped.toExponential(2) + " — it is zero for a reason, not small by luck, so it is removed by name");
    const tm = measureCutoffs({ kind: "TM", nx: 24, ny: 12, a, b, count: 2 });
    ok("...and the Dirichlet problem has no such mode at all",
       tm.dropped === null && tm.ks[0] > 3,
       "lowest TM " + tm.ks[0].toFixed(4) + " — a function vanishing on the boundary cannot be constant unless it is zero everywhere");
}

// ---- 4. DEGENERACY IS A FACT ABOUT THE GEOMETRY, AND THE SOLVER REPRODUCES IT ------------------------------------------
// For a = 2b the modes (0,1) and (2,0) have identical cutoffs. Nothing in the matrix knows this; it falls out.
{
    const te = measureCutoffs({ kind: "TE", nx: 32, ny: 16, a, b, count: 3 });
    const gap = Math.abs(te.ks[1] - te.ks[2]) / te.ks[1];
    ok("!! TE01 and TE20 come out DEGENERATE for a 2:1 guide, as the geometry requires",
       gap < 1e-6,
       "the second and third cutoffs are " + te.ks[1].toFixed(6) + " and " + te.ks[2].toFixed(6) +
       " (relative gap " + gap.toExponential(1) + ") — the exact modes are (" +
       te.modes[1].m + "," + te.modes[1].n + ") and (" + te.modes[2].m + "," + te.modes[2].n + ")");
}

// ---- 5. SABOTAGE: THE WRONG BOUNDARY CONDITION RETURNS A MODE THAT DOES NOT EXIST -------------------------------------
{
    const tmTrue = measureCutoffs({ kind: "TM", nx: 32, ny: 16, a, b, count: 1 });
    const tmWrong = measureCutoffs({ kind: "TE", nx: 32, ny: 16, a, b, count: 1 });   // Neumann where Dirichlet belongs
    const off = tmTrue.ks[0] / tmWrong.ks[0];
    ok("!! solving TM with the Neumann operator reports a cutoff 2.23x too low — the TE10 mode, which TM does not have",
       Math.abs(off - Math.sqrt(5)) / Math.sqrt(5) < 5e-3,
       "true TM11 " + tmTrue.ks[0].toFixed(4) + " vs the sabotaged " + tmWrong.ks[0].toFixed(4) + " (" + off.toFixed(3) + "x) — " +
       "and it is a TIDY, PLAUSIBLE number for a pipe that does not exist, which is why the mode set is checked and not only the frequencies");
    ok("...and the two operators really are different matrices, not the same one relabelled",
       (() => { const A = laplacian2D({ nx: 6, ny: 4, a, b, neumann: false });
                const B = laplacian2D({ nx: 6, ny: 4, a, b, neumann: true });
                let d = 0; for (let i = 0; i < A.A.length; i++) d = Math.max(d, Math.abs(A.A[i] - B.A[i]));
                return d > 0.1; })(),
       "the ghost fold changes the diagonal on every boundary row, and nowhere else");
}

// ---- 6. THE FREQUENCY USES THE DEFINED SPEED OF LIGHT ---------------------------------------------------------------------
{
    const f = cutoffFrequency(1, 0, 0.02286, 0.01016);         // WR-90, the standard X-band guide, in metres
    ok("!! the TE10 cutoff of a WR-90 guide comes out at 6.557 GHz, the catalogue figure",
       Math.abs(f / 1e9 - 6.557) < 0.01,
       (f / 1e9).toFixed(4) + " GHz for a = 22.86 mm — a number an engineer can look up, computed from c = " + C_DEFINED + " m/s exactly");
    ok("...and cutoffK is symmetric under swapping the axes with the mode indices",
       Math.abs(cutoffK(1, 2, 2, 1) - cutoffK(2, 1, 1, 2)) < 1e-12);
}

console.log(fails ? ("[waveguide-selfcheck] FAILED " + fails) : "[waveguide-selfcheck] all passed");
process.exit(fails ? 1 : 0);
