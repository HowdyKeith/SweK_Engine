// WebGLEngine/physics/mesh/exactPredicates.mjs
//
// *** BVH-CSG ROUND 16b: AN EXACT orient3d. *** Round 16 measured where tolerances stop: on a copy of a mesh rotated
// 1e-9..3e-8 the seam's pieces are decided pair by pair with a 1e-9 snap, and two pairs that share an edge can decide it
// differently -- the band's worst, 2.8e-2, is built from such decisions (meshBoolean.mjs's ROUND 16 paragraph). A
// decision taken from the SIGN of an exact determinant of the input coordinates is the same in every pair that asks it.
//
//   orient3d(a, b, c, d) -> +1 | 0 | -1      the sign of det[a - d; b - d; c - d], exactly
//
// Positive when d lies below the plane through a, b, c as seen with a -> b -> c counter-clockwise (Shewchuk's
// convention): equivalently, sign(dot(cross(b - a, c - a), a - d)).
//
// HOW: a floating-point evaluation first, trusted when its magnitude exceeds Shewchuk's a-priori bound for exactly this
// expression -- (7 + 56 eps) eps times the permanent, the bound that already covers the rounded differences a - d (J. R.
// Shewchuk, "Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates", 1997, orient3dfast and
// o3derrboundA). Otherwise the determinant is computed EXACTLY: every coordinate is a double, i.e. m x 2^e with an
// integer m, so all twelve are brought to the smallest exponent among them and the determinant is taken in BigInt. No
// adaptive expansion stages -- the BigInt path is slow, and the filter decides all but the near-degenerate cases
// (orient3d.stats counts both).
"use strict";

const EPS = 2 ** -53;
const O3D_ERRBOUND_A = (7 + 56 * EPS) * EPS;

const dv = new DataView(new ArrayBuffer(8));
// x as [m, e] with x === m * 2^e exactly, m a BigInt (exported for the gate, which reconstructs every x from it)
export function decompose(x) {
    if (x === 0) return [0n, 0];
    if (!Number.isFinite(x)) throw new Error("exactPredicates: non-finite coordinate " + x);
    dv.setFloat64(0, x);
    const hi = dv.getUint32(0), lo = dv.getUint32(4);
    const exp = (hi >>> 20) & 0x7ff;
    let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo), e;
    if (exp === 0) e = -1074;                 // subnormal
    else { m |= 1n << 52n; e = exp - 1075; }
    return [hi >>> 31 ? -m : m, e];
}

/** The sign of det[a - d; b - d; c - d], computed exactly. */
export function orient3dExact(a, b, c, d) {
    const parts = [...a, ...b, ...c, ...d].map(decompose);
    let E = Infinity;
    for (const [m, e] of parts) if (m !== 0n && e < E) E = e;
    if (E === Infinity) return 0;
    const X = parts.map(([m, e]) => (m === 0n ? 0n : m << BigInt(e - E)));
    const adx = X[0] - X[9], ady = X[1] - X[10], adz = X[2] - X[11];
    const bdx = X[3] - X[9], bdy = X[4] - X[10], bdz = X[5] - X[11];
    const cdx = X[6] - X[9], cdy = X[7] - X[10], cdz = X[8] - X[11];
    const det = adx * (bdy * cdz - bdz * cdy) + bdx * (cdy * adz - cdz * ady) + cdx * (ady * bdz - adz * bdy);
    return det > 0n ? 1 : det < 0n ? -1 : 0;
}

/** The sign of det[a - d; b - d; c - d]: filtered, exact when the filter cannot decide. */
export function orient3d(a, b, c, d) {
    const adx = a[0] - d[0], ady = a[1] - d[1], adz = a[2] - d[2];
    const bdx = b[0] - d[0], bdy = b[1] - d[1], bdz = b[2] - d[2];
    const cdx = c[0] - d[0], cdy = c[1] - d[1], cdz = c[2] - d[2];
    const bc = bdy * cdz - bdz * cdy, ca = cdy * adz - cdz * ady, ab = ady * bdz - adz * bdy;
    const det = adx * bc + bdx * ca + cdx * ab;
    const perm = (Math.abs(bdy * cdz) + Math.abs(bdz * cdy)) * Math.abs(adx)
               + (Math.abs(cdy * adz) + Math.abs(cdz * ady)) * Math.abs(bdx)
               + (Math.abs(ady * bdz) + Math.abs(adz * bdy)) * Math.abs(cdx);
    const bound = O3D_ERRBOUND_A * perm;
    if (det > bound) { orient3d.stats.filtered++; return 1; }
    if (-det > bound) { orient3d.stats.filtered++; return -1; }
    orient3d.stats.exact++;
    return orient3dExact(a, b, c, d);
}
orient3d.stats = { filtered: 0, exact: 0 };
