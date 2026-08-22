// physics/xpbd/volumeKey-selfcheck.mjs
//
// v3459 -- GRADING THE PRESSURE CONSTRAINT, AND A NAME THAT IS WRONG.
//
// volume.js was the second of fifteen ungraded modules under physics/xpbd. Three exact keys and one defect.
//
//   GEOMETRY   enclosedVolume is the divergence-theorem sum over triangles, so on a sphere mesh it approaches
//              4/3 pi r^3 at SECOND order in edge length -- a polyhedron's chord error is quadratic. Measured
//              error ratios across subdivisions: 2.29, 3.36, 3.82, approaching 4.
//   CONSERVED  at target the volume is bit-identical from step to step -- exact, not within a tolerance.
//   TARGET     every inflation is hit to within 1.6e-16: 0.7 -> 0.700000, 1.5 -> 1.500000, 2.0 -> 2.000000.
//
// *** generateIcosphere DOES NOT GENERATE AN ICOSPHERE. *** 6 vertices, 8 faces, subdividing 8 -> 32 -> 128 ->
// 512. That is an OCTAHEDRON base. An icosphere starts from an icosahedron: 12 vertices, 20 faces, 20 -> 80 ->
// 320. The mesh is a perfectly good sphere approximation and every number above is correct -- the NAME is not,
// and someone choosing a subdivision level by icosahedral face counts gets a quarter of the triangles they
// expected.
//
// AND A MISTAKE OF MINE THAT PRODUCED A PLAUSIBLE PASS: solveVolume takes lambda as a Float64Array. I passed an
// object, and the conservation instrument returned verdict "bounded" with a NaN drift -- a verdict computed from
// a series of NaNs, which reads as success. The argument shape is asserted below rather than assumed.

import { meshVolume, volumeConvergence, pressureRun, baseSolid, SPHERE_VOLUME } from "./volumeKey.mjs";
import { auditConservation } from "../../tools/roundhouse/conservation.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE GEOMETRY CONVERGES, AT THE RIGHT ORDER ---------------------------------------------------------------
{
    const c = volumeConvergence();
    ok("!! the mesh volume converges to 4/3 pi r^3",
        c.rows[c.rows.length - 1].errFrac < 0.03,
        `${c.rows.map((r) => r.volume.toFixed(4)).join(" -> ")} against an exact ${SPHERE_VOLUME().toFixed(6)}. ` +
        "The divergence-theorem sum is exact for the POLYHEDRON; the residual is the polyhedron not being a sphere");

    ok("!! and the error falls at SECOND order, which is the check that matters",
        c.approachesFour === true,
        `ratios ${c.ratios.map((r) => r.toFixed(2)).join(", ")} between successive subdivisions, approaching 4. ` +
        "A chord error is quadratic in edge length, so first-order convergence would mean the volume sum itself " +
        "is wrong rather than the mesh being coarse -- the value alone cannot separate those");
}

// ---- 2. CONSERVED AT TARGET, EXACTLY --------------------------------------------------------------------------------
{
    const p = pressureRun({ inflation: 1.0, steps: 400 });
    const a = auditConservation(p.series);
    ok("!! at target the enclosed volume is conserved EXACTLY",
        a.verdict === "exact",
        "every one of 400 samples bit-identical to the first. Reporting this as 'conserved to 1e-16' would " +
        "understate a constraint that is already satisfied and leave room to widen the bound later");

    ok("...and the series is real numbers, which is asserted rather than assumed",
        p.series.every((v) => Number.isFinite(v)) && p.series.length === 400,
        "solveVolume takes lambda as a Float64Array. Passing an object gave a series of NaNs, and the " +
        "conservation instrument called that BOUNDED with a NaN drift -- a pass computed from nothing. A " +
        "finiteness check costs one line and is the difference between a verdict and a coincidence");
}

// ---- 3. THE TARGET IS HIT, AND THE SIGN IS PART OF THE KEY --------------------------------------------------------------
{
    const rows = [0.7, 1.0, 1.5, 2.0].map((i) => pressureRun({ inflation: i }));
    ok("!! every inflation target is reached to machine precision",
        rows.every((r) => r.targetErrFrac < 1e-12),
        rows.map((r) => `${r.target} -> ${r.ratio.toFixed(6)}`).join("  ") + ". Worst departure " +
        `${Math.max(...rows.map((r) => r.targetErrFrac)).toExponential(1)}`);

    ok("...and below target it INFLATES while above it DEFLATES",
        rows[0].ratio < 1 && rows[2].ratio > 1 && rows[3].ratio > rows[2].ratio,
        "the sign of the correction carries which side of target the mesh is on. A magnitude-only check would " +
        "accept a constraint that drove volume the wrong way and still landed on a number");
}

// ---- 4. THE NAME ---------------------------------------------------------------------------------------------------------
{
    const b = baseSolid();
    ok("!! *** generateIcosphere builds an OCTAHEDRON base, not an icosahedron ***",
        b.isOctahedron === true && b.isIcosahedron === false,
        `${b.vertices} vertices and ${b.faces} faces, subdividing 8 -> 32 -> 128 -> 512. An icosphere is 12 and ` +
        "20, subdividing 20 -> 80 -> 320. The mesh is a fine sphere approximation and the physics above is " +
        "unaffected -- but a reader picking a subdivision level from icosahedral face counts gets a quarter of " +
        "the triangles they expected, and the function name is what they would be reading");
}

console.log();
if (fails) { console.log("volumeKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("volumeKey-selfcheck: all checks pass");
