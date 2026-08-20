// WebGLEngine/physics/mechanics/fragmentRotation-selfcheck.mjs -- v3565
//
// Run: node physics/mechanics/fragmentRotation-selfcheck.mjs
// RUNTIME 1s MEASURED with date(1) around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 1 IS LOAD-BEARING FOR EVERYTHING ELSE: on a real fragment there is NO independent answer to check
// the eigensolver against, so the only honest order is to prove it on a body whose spectrum is known in advance
// and only then believe what it says about a broken one. ***
"use strict";
import { tensorMatrix, principalMoments, rotationMatrix, conjugate, trace, isPhysicalSpectrum,
         fragmentRotation, shatter, fragmentCensus, MEASURED_V3565, reportLines } from "./fragmentRotation.mjs";
import { distinctMoments, stabilityRate } from "./freeRotation.mjs";
import { symEigenvalues } from "../quantum/rmt.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("fragmentRotation-selfcheck -- massProperties -> symEigenvalues -> freeRotation\n");

const BOX = [6.5, 5.0, 2.5, 0, 0, 0];           // the v3562 fixture's analytic tensor, already diagonal
const EXPECT = [2.5, 5.0, 6.5];                  // ascending

// ---------------------------------------------------------------------------
console.log("1. *** THE KEY: A KNOWN SPECTRUM SURVIVES A ROTATION IT DID NOT CHOOSE ***");
{
    const R = rotationMatrix([0.31, -0.77, 0.56], 0.9);
    const rot = conjugate(BOX, R);
    report("off-diagonal after rotation", "Ixy " + rot[3].toFixed(4) + "  Ixz " + rot[4].toFixed(4) +
        "  Iyz " + rot[5].toFixed(4));
    ok("!! the rotation really does produce products of inertia",
        Math.abs(rot[3]) > 0.1 && Math.abs(rot[4]) > 0.1 && Math.abs(rot[5]) > 0.1,
        "*** WITHOUT THIS THE WHOLE SECTION IS VACUOUS: diagonalising an already-diagonal matrix proves " +
        "nothing, and an axis chosen for convenience could leave it nearly diagonal by accident. ***");

    const back = principalMoments(rot);
    const worst = Math.max(...back.map((v, i) => Math.abs(v - EXPECT[i]) / EXPECT[i]));
    report("recovered", back.map((v) => v.toFixed(12)).join("  ") + "   worst rel " + worst.toExponential(2));
    ok("!! *** THE ORIGINAL DIAGONAL COMES BACK, AND THE ANSWER WAS KNOWN BEFORE THE SOLVER RAN ***",
        worst < 1e-12,
        "two routes sharing no code -- a 3x3 conjugation against tred2 + tql. *** symEigenvalues WAS WRITTEN " +
        "FOR RANDOM-MATRIX SPECTRA AND HAD NEVER BEEN ASKED A QUESTION ABOUT A RIGID BODY. This is the check " +
        "that earns the right to believe it about a fragment, where no independent answer exists. ***");

    // and it must hold for MANY rotations, or one lucky axis is doing the work
    let worstAll = 0;
    for (let k = 0; k < 40; k++) {
        const Rk = rotationMatrix([Math.sin(k * 1.7) + 0.3, Math.cos(k * 2.3), Math.sin(k * 0.9) - 0.4], 0.2 + k * 0.15);
        const b = principalMoments(conjugate(BOX, Rk));
        worstAll = Math.max(worstAll, ...b.map((v, i) => Math.abs(v - EXPECT[i]) / EXPECT[i]));
    }
    ok("...and over forty different rotations, so no single axis is carrying it", worstAll < 1e-12,
        "worst relative error " + worstAll.toExponential(2));
}

// ---------------------------------------------------------------------------
console.log("\n2. TWO INVARIANTS THE SOLVER NEVER SEES AS TARGETS");
{
    const R = rotationMatrix([1, 2, -3], 1.1);
    const rot = conjugate(BOX, R);
    const P = principalMoments(rot);
    const tr = Math.abs(P.reduce((a, b) => a + b, 0) - trace(rot)) / trace(rot);
    report("trace residual", tr.toExponential(2));
    ok("!! the eigenvalues SUM to the trace, which is rotation-invariant", tr < 1e-14,
        "tr(I) does not change under rotation and the eigensolver is never told it -- a wrong spectrum cannot " +
        "hit it by accident");
    ok("!! and the spectrum is PHYSICAL: I1 <= I2 + I3", isPhysicalSpectrum(P),
        "*** NOT A TOLERANCE -- a statement about mass being non-negative and lying somewhere. A spectrum " +
        "violating it is not slightly wrong, IT IS NOT A BODY. ***");
    ok("!! ...and the physicality test can FAIL, so it is not decoration",
        !isPhysicalSpectrum([1, 1, 10]) && isPhysicalSpectrum([1, 1, 2]),
        "[1,1,10] violates the triangle inequality and is refused; [1,1,2] sits exactly on it and is accepted");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** A HOLE IS NOT A BREAK, AND THREE FIXTURES PROVED IT THE HARD WAY ***");
{
    const f = shatter();
    report("loose fragments", String(f.loose.length) + " of " + f.count + " components");
    ok("!! the fixture actually SEVERS pieces", f.loose.length > 3,
        "*** CARVING A HOLE IN AN ANCHORED SLAB SEVERS NOTHING: a wide carve, two carves pinching a waist, and " +
        "a horizontal slot with a pillar left in ALL returned one component and ZERO loose fragments. What " +
        "breaks a body is a cut that SEPARATES, which is a different operation from removing material. *** " +
        "This fixture cuts the slab free along a plane, then cuts THAT into pieces.");
    ok("...and every fragment has positive mass and voxels", f.loose.every((m) => m.mass > 0 && m.voxels > 0));
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE CENSUS CORRECTS WHAT v3564 SAID IN PROSE ***");
{
    const c = fragmentCensus();
    for (const r of c.rows)
        report(String(r.voxels).padStart(6), r.principal.map((v) => v.toFixed(2).padStart(10)).join(" ") +
            "   spread " + r.spread.toFixed(4) + "   " + (r.distinct ? "distinct" : "DEGENERATE"));
    report("census", c.distinct + " distinct / " + c.degenerate + " degenerate of " + c.total);

    ok("!! fracture DOES generate intermediate-axis bodies", c.distinct > 0,
        c.distinct + " of " + c.total + " fragments have three distinct moments and can tumble");
    ok("!! *** AND v3564'S PROSE WAS WRONG: 'a broken fragment essentially never has two equal moments' ***",
        c.degenerate > 0,
        c.degenerate + " of " + c.total + " DO, and one is PERFECTLY CUBIC -- all three moments identical to " +
        "the last digit. A fracture along GRID PLANES produces square and cubic pieces, so the claim only " +
        "holds where the break is irregular. *** THAT IS WHAT MAKES THE CENSUS NON-VACUOUS: 'every fragment " +
        "tumbles' would be worth nothing if no body in the fixture failed to. ***");
    ok("!! every spectrum in the census is physical", c.rows.every((r) => r.physical),
        "the triangle inequality holds on all " + c.total + " -- nine independent bodies, none of them a " +
        "shape the eigensolver invented");
    ok("...and every trace residual is at machine precision",
        c.rows.every((r) => r.traceResidual < 1e-12),
        "worst " + Math.max(...c.rows.map((r) => r.traceResidual)).toExponential(2));
}

// ---------------------------------------------------------------------------
console.log("\n5. THE JOIN: A FRAGMENT REACHES freeRotation, AND A DEGENERATE ONE IS REFUSED");
{
    const c = fragmentCensus();
    const spinner = c.rows.find((r) => r.distinct), flat = c.rows.find((r) => !r.distinct);
    report("a tumbling fragment", spinner.voxels + " voxels   sigma/omega " + spinner.sigma.toFixed(5));
    report("a degenerate fragment", flat.voxels + " voxels   sigma/omega " + flat.sigma.toFixed(5));
    ok("!! the distinct fragment gets a real growth rate from freeRotation's own derivation",
        spinner.sigma > 0 &&
        Math.abs(spinner.sigma - stabilityRate(spinner.principal, 1, 1).sigma) < 1e-15,
        "sigma comes from stabilityRate on the DIAGONALISED moments -- v3562's formula, unchanged, now " +
        "reachable for a body whose axes nobody chose");
    ok("!! *** the degenerate one reports ZERO rather than a plausible number ***",
        flat.sigma === 0 && !distinctMoments(flat.principal),
        "two of its moments are equal, so THERE IS NO INTERMEDIATE AXIS and the instrument says so instead of " +
        "returning something. v3562's cube case, arriving from a real fracture rather than a fixture.");
    ok("nothing is ratcheted", !("baseline" in MEASURED_V3565),
        "one carve pattern, nine fragments. A baseline frozen here would freeze MY CHOICE OF CUTS -- and this " +
        "round is precisely about how much that choice decides.");
    ok("the report prints and the tool exits zero", reportLines().length > 12,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
}

console.log(fails ? `\nfragmentRotation-selfcheck: ${fails} FAILED` : "\nfragmentRotation-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
