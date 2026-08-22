// WebGLEngine/physics/mechanics/fragmentRotation.mjs -- v3565
// ---------------------------------------------------------------------------------------------------------------
// THE THREE-FILE PATH: massProperties -> symEigenvalues -> freeRotation.
//
// v3564 answered Keith's fracture question from the tree and stopped at the missing piece. All three parts
// already existed and NOTHING HAD EVER JOINED THEM:
//
//   physics/voxel/fracture.js      massProperties() -> a FULL 3x3 inertia tensor per fragment, products of
//                                  inertia included, each voxel's own inertia carried beside the parallel-axis
//                                  term -- which its own header calls "the difference between a physics bridge
//                                  and a plausible one"
//   physics/quantum/rmt.js         symEigenvalues() -- "ONE symmetric eigensolver in this tree, already gated",
//                                  in beam.js's words, written for random matrix spectra and never asked a
//                                  question about a rigid body
//   physics/mechanics/freeRotation freeRotation.mjs (v3562) -- Euler's equations and the intermediate axis,
//                                  which until now could only be handed a box whose axes were already known
//
// *** THE JOIN IS THE ROUND, AND IT IS SHORT BECAUSE THE PIECES WERE RIGHT. What it buys is not convenience:
// v3562's instrument could only be given a body whose principal axes were the coordinate axes -- an ANALYTIC
// BOX. A FRACTURE FRAGMENT'S TENSOR IS NOT DIAGONAL, so its principal axes are wherever the break left them,
// and without an eigensolver there was no way to even ASK which axis is the intermediate one. ***
//
// ================================================================================================================
// THE KEYS, AND THE FIRST TWO SHARE NO CODE WITH WHAT THEY GRADE
// ================================================================================================================
//
// 1. THE ROTATED BOX. Take an analytic diagonal tensor, conjugate it by a KNOWN rotation to get a full tensor
//    with products of inertia, diagonalise, and the eigenvalues must come back the ORIGINAL DIAGONAL. The
//    answer is known before the eigensolver runs, and the two routes share nothing: one is a 3x3 matrix
//    multiply, the other is tred2 + tql. *** THIS IS THE KEY THAT MAKES EVERYTHING BELOW MEAN ANYTHING, because
//    on a real fragment there is no independent answer to check against. ***
//
// 2. TRACE INVARIANCE. tr(I) does not change under rotation, so the eigenvalues must SUM to Ixx+Iyy+Izz --
//    a number the eigensolver never sees as a target and cannot reach by accident on a wrong spectrum.
//
// 3. THE TRIANGLE INEQUALITY. Every physical body satisfies I1 <= I2 + I3 on its principal moments. It is not a
//    numerical property, it is a statement about mass being non-negative and lying somewhere -- so a spectrum
//    violating it is not slightly wrong, IT IS NOT A BODY.
//
// 4. THE CENSUS, AND IT IS THE CLAIM v3564 MADE IN PROSE: does fracture actually GENERATE intermediate-axis
//    bodies? Measured over real fragments rather than asserted -- and with the degenerate case demanded rather
//    than hoped for, because "every fragment tumbles" is only interesting if some body in the census does NOT.
"use strict";
import { pathToFileURL } from "node:url";
import { symEigenvalues } from "../quantum/rmt.js";
import { carveSphere, looseFragments, massProperties } from "../voxel/fracture.js";
import { stabilityRate, distinctMoments, growthFactor } from "./freeRotation.mjs";

/** massProperties packs I as [Ixx, Iyy, Izz, Ixy, Ixz, Iyz]; symEigenvalues wants row-major 3x3. */
export function tensorMatrix(I6) {
    const [xx, yy, zz, xy, xz, yz] = I6;
    return [xx, xy, xz, xy, yy, yz, xz, yz, zz];
}

/** Principal moments, ascending. The eigensolver already sorts; this is the one place that is relied on. */
export function principalMoments(I6) {
    return symEigenvalues(tensorMatrix(I6), 3);
}

/** A rotation matrix from an axis-angle, so a fixture can be rotated by something NOT chosen for convenience. */
export function rotationMatrix(axis, theta) {
    const n = Math.hypot(...axis), [x, y, z] = axis.map((v) => v / n);
    const c = Math.cos(theta), s = Math.sin(theta), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
            t * x * y + s * z, t * y * y + c, t * y * z - s * x,
            t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

/** I' = R I R^T, returned in massProperties' 6-vector packing so both routes speak one language. */
export function conjugate(I6, R) {
    const A = tensorMatrix(I6), P = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) s += R[i * 3 + k] * A[k * 3 + l] * R[j * 3 + l];
        P[i * 3 + j] = s;
    }
    return [P[0], P[4], P[8], P[1], P[2], P[5]];
}

export const trace = (I6) => I6[0] + I6[1] + I6[2];

/**
 * *** A SPECTRUM THAT VIOLATES THIS IS NOT A BODY. *** Every rigid body's principal moments satisfy
 * I1 <= I2 + I3, because each moment is an integral of non-negative mass times a squared distance. It is a
 * physical statement, not a tolerance -- which is why it grades a fragment nothing else can check.
 */
export function isPhysicalSpectrum(P, rel = 1e-9) {
    const s = [...P].sort((a, b) => a - b);
    return s[0] >= -Math.abs(s[2]) * rel && s[2] <= s[0] + s[1] + Math.abs(s[2]) * rel;
}

/** The full reading for one fragment: principal moments, which axis is intermediate, and how fast it runs away. */
export function fragmentRotation(mp, { Omega = 1 } = {}) {
    const P = principalMoments(mp.I);
    const mid = distinctMoments(P) ? 1 : -1;          // P is ascending, so index 1 IS the intermediate one
    return {
        mass: mp.mass, voxels: mp.voxels,
        principal: P,
        traceResidual: Math.abs(P.reduce((a, b) => a + b, 0) - trace(mp.I)) / Math.abs(trace(mp.I) || 1),
        physical: isPhysicalSpectrum(P),
        distinct: mid >= 0,
        sigma: mid >= 0 ? stabilityRate(P, mid, Omega).sigma : 0,
        // relative spread of the moments: 0 for a sphere or cube, large for a splinter
        spread: P[2] > 0 ? (P[2] - P[0]) / P[2] : 0,
    };
}

/**
 * A fixture that actually BREAKS, and getting there was the round's second finding.
 *
 * Carving a hole in the middle of an anchored slab severs NOTHING -- three separate attempts (a wide carve, two
 * carves pinching a waist, a horizontal slot with a pillar left in) all returned ONE component and ZERO loose
 * fragments. A hole is not a break. What breaks a body is a cut that SEPARATES, so this slices the slab free
 * along a plane and then cuts THAT into pieces, with two irregular carves so not every piece is a rectangle.
 */
export function shatter({ nx = 32, ny = 20, nz = 32, cell = 1, density = 1 } = {}) {
    const grid = new Uint8Array(nx * ny * nz).fill(1);
    const at = (x, y, z) => (z * ny + y) * nx + x;
    for (let z = 0; z < nz; z++) for (let y = 8; y < 10; y++) for (let x = 0; x < nx; x++) grid[at(x, y, z)] = 0;
    for (let y = 10; y < ny; y++) for (let z = 0; z < nz; z++) { grid[at(11, y, z)] = 0; grid[at(21, y, z)] = 0; }
    for (let y = 10; y < ny; y++) for (let x = 0; x < nx; x++) { grid[at(x, y, 13)] = 0; grid[at(x, y, 24)] = 0; }
    carveSphere(grid, nx, ny, nz, 5, 16, 5, 3.2);
    carveSphere(grid, nx, ny, nz, 27, 14, 29, 4.1);
    const lf = looseFragments(grid, nx, ny, nz);
    const loose = lf.loose.map((label) => massProperties(lf.labels, label, nx, ny, nz, cell, density)).filter(Boolean);
    return { ...lf, loose };
}

/** The census v3564 claimed in prose. Returns { total, distinct, degenerate, rows }. */
export function fragmentCensus(opts) {
    const rows = shatter(opts).loose.map((mp) => fragmentRotation(mp));
    return {
        total: rows.length,
        distinct: rows.filter((r) => r.distinct).length,
        degenerate: rows.filter((r) => !r.distinct).length,
        rows,
    };
}

export const MEASURED_V3565 = {
    join: "massProperties -> symEigenvalues -> freeRotation. All three existed; nothing had joined them, and " +
          "symEigenvalues was written for random-matrix spectra and had never been asked about a rigid body.",
    whatItBuys:
        "v3562's instrument could only be handed a body whose principal axes ARE the coordinate axes -- an " +
        "analytic box. A FRACTURE FRAGMENT'S TENSOR IS NOT DIAGONAL, so without an eigensolver there was no " +
        "way to even ASK which axis is the intermediate one.",
    rotatedBoxKey:
        "Conjugate an analytic diagonal tensor by a KNOWN rotation, diagonalise, and the original diagonal must " +
        "come back. The answer is known before the solver runs and the two routes share no code (a 3x3 matrix " +
        "multiply against tred2 + tql). THIS IS WHAT MAKES THE FRAGMENT READINGS MEAN ANYTHING, because on a " +
        "real fragment there is no independent answer to check against.",
    proseCorrected:
        "*** v3564 SAID 'A BROKEN FRAGMENT ESSENTIALLY NEVER HAS TWO EQUAL MOMENTS'. MEASURED: FOUR OF NINE DO, " +
        "and one is PERFECTLY CUBIC -- all three moments identical to the last digit. *** A fracture along grid " +
        "planes produces SQUARE AND CUBIC PIECES, so the claim only holds where the break is irregular. That is " +
        "not a weakness of the census, it is what makes it non-vacuous: 'every fragment tumbles' would be worth " +
        "nothing if no body in the fixture failed to.",
    aHoleIsNotABreak:
        "Three fixtures produced ZERO loose fragments -- a wide carve, two carves pinching a waist, and a " +
        "horizontal slot with a pillar left in. CARVING A HOLE IN AN ANCHORED SLAB SEVERS NOTHING. What breaks " +
        "a body is a cut that SEPARATES, which is a different operation from removing material.",
    triangleInequality:
        "I1 <= I2 + I3 on the principal moments -- a statement about mass being non-negative and lying " +
        "somewhere, not a tolerance. A spectrum violating it is NOT A BODY.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const L = [];
    L.push("[fragmentRotation] Can a broken piece tumble? -- massProperties -> symEigenvalues -> freeRotation");
    L.push("");
    // THE KEY FIRST, because every number after it is only worth what the eigensolver is worth.
    const box = [6.5, 5.0, 2.5, 0, 0, 0];
    const R = rotationMatrix([0.31, -0.77, 0.56], 0.9);
    const rot = conjugate(box, R);
    const back = principalMoments(rot);
    L.push("  THE KEY -- an analytic box conjugated by a known rotation, then diagonalised:");
    L.push("    original diagonal   " + [2.5, 5.0, 6.5].map((v) => v.toFixed(10)).join("  "));
    L.push("    off-diagonal after rotation   Ixy " + rot[3].toFixed(4) + "  Ixz " + rot[4].toFixed(4) +
           "  Iyz " + rot[5].toFixed(4) + "   <- NOT diagonal, which is the point");
    L.push("    recovered           " + back.map((v) => v.toFixed(10)).join("  "));
    L.push("");
    const frac = shatter();
    L.push("  A SHATTERED SLAB: " + frac.loose.length + " loose fragment(s)");
    L.push("");
    L.push("    voxels    principal moments (ascending)         spread   distinct   sigma/omega");
    let distinct = 0, degenerate = 0;
    for (const mp of frac.loose.slice(0, 12)) {
        const r = fragmentRotation(mp);
        r.distinct ? distinct++ : degenerate++;
        L.push("    " + String(r.voxels).padStart(6) + "    " +
               r.principal.map((v) => v.toFixed(3).padStart(11)).join(" ") + "   " +
               r.spread.toFixed(4) + "   " + (r.distinct ? "yes" : "NO ") + "        " + r.sigma.toFixed(5));
    }
    L.push("");
    L.push("  " + distinct + " of " + Math.min(12, frac.loose.length) + " shown have THREE DISTINCT MOMENTS " +
           "and can therefore tumble.");
    L.push("  " + MEASURED_V3565.whatItBuys);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
