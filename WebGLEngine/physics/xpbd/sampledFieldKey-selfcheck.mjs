// physics/xpbd/sampledFieldKey-selfcheck.mjs
//
// v3463 -- GRADING THE EXTERNAL-FIELD SAMPLER. sampledField.js hands the engine a world-supplied vector grid --
// the shape of a radar return or a Doppler-velocity volume -- and samples it trilinearly at each particle. Its
// header states a falsifiable property: "Trilinear reproduces any affine field exactly, which nearest-neighbour
// cannot", and clamps out-of-range reads to the edge. Three edges, none the tautology of grading the sampler
// against itself:
//
//   AFFINE IDENTITY   trilinear vs the ANALYTIC affine value, 2.7e-15 -- an algebraic identity (a multilinear
//                     blend of affine corners IS the affine value), not the sampler compared to the sampler.
//   NODE IDENTITY     sample AT a node, the weight collapses to 1, the stored value returns to the bit.
//   CLAMP IDENTITY    sample OUTSIDE, the read lands on the nearest edge node exactly, never past it.
//
// *** THE PLANT IS NEAREST-NEIGHBOUR, AND IT IS HONEST: at a grid NODE it returns the SAME value trilinear does,
// so it is invisible exactly where a hand-check would look, and shows only BETWEEN nodes (8.2e-1 against
// 2.7e-15). *** The compliance/modulate discipline again -- agree at the special points, part everywhere else.

import { sampledKeys, affineReproduction, nodeIdentity, clampIdentity, nearestNeighbourPlant } from "./sampledFieldKey.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const keys = sampledKeys();

// ---- 1. THE FIELD HAS REAL VARIATION BEFORE ANY EXACTNESS IS READ OFF IT ----------------------------------------------
{
    ok("the sampled field actually varies, so the identities are not read off a constant",
        Number.isFinite(keys.nnAffineErr) && keys.nnAffineErr > 1e-2,
        `nearest-neighbour departs from the affine field by ${keys.nnAffineErr.toExponential(3)} between nodes. ` +
        "Asserted first because on a CONSTANT field nearest-neighbour would also be exact and every key below " +
        "would pass on a field that carries no information -- this is the positive control");
}

// ---- 2. TRILINEAR REPRODUCES AN AFFINE FIELD, THE PLANT DOES NOT -------------------------------------------------------
{
    const a = affineReproduction();
    ok("!! trilinear reproduces an affine field to machine epsilon",
        a.affineErr < 1e-12 && a.affineErr > 0,
        `worst trilinear-vs-analytic error ${a.affineErr.toExponential(3)} over 3000 interior points. An affine ` +
        "field is multilinear, so the eight-corner blend IS the analytic value -- the reference is the closed " +
        "form a.x+b, never the sampler re-run, so this is not a mirror. Nonzero because it is real arithmetic, " +
        "not an exact-by-construction zero");

    ok("!! and nearest-neighbour misses it by fourteen orders",
        a.nnAffineErr > 1e6 * a.affineErr,
        `nearest-neighbour ${a.nnAffineErr.toExponential(3)} against trilinear ${a.affineErr.toExponential(3)}. ` +
        "The property is what SEPARATES the two interpolants, so a device graded only on 'does a force get " +
        "applied' would rate the plant a working sampler");
}

// ---- 3. SAMPLING AT A NODE IS THE BIT-EXACT STORED VALUE --------------------------------------------------------------
{
    const n = nodeIdentity();
    ok("!! sampling AT a grid node returns the stored value exactly",
        n.nodeErr === 0,
        `worst node error ${n.nodeErr.toExponential(2)} across every node of a 5x6x7 grid. On an integer grid the ` +
        "fractional part is exactly 0, so the corner weight is exactly 1 -- a wrong index or a botched fraction " +
        "would break this, so the zero has power over a real bug");
}

// ---- 4. SAMPLING OUTSIDE CLAMPS TO THE EDGE, NEVER PAST IT ------------------------------------------------------------
{
    const c = clampIdentity();
    ok("!! sampling outside the grid returns the nearest edge node exactly",
        c.clampErr === 0,
        `worst clamp error ${c.clampErr.toExponential(2)} across six out-of-range queries on all three axes. The ` +
        "failure this refuses is a read PAST the array or onto the wrong edge -- both would move this off zero");
}

// ---- 5. THE PLANT IS HONEST: NEAREST-NEIGHBOUR AGREES WITH TRILINEAR AT THE NODES -------------------------------------
{
    const p = nearestNeighbourPlant();
    ok("!! nearest-neighbour AGREES with trilinear at every node and only parts between them",
        p.agreesAtNodes === true && p.partsBetween === true,
        `at the nodes the two are identical (worst ${p.nnNodeErr.toExponential(2)}) because both read that node's ` +
        `stored value; between them they part by ${p.nnAffineErr.toExponential(3)}. A plant invisible exactly ` +
        "where a hand-check looks, visible everywhere else -- the compliance-key discipline transplanted to " +
        "interpolation, and the sign that the planting changes the interpolation and nothing else");
}

console.log();
if (fails) { console.log("sampledFieldKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("sampledFieldKey-selfcheck: all checks pass");
