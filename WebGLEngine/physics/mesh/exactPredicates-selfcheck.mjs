// WebGLEngine/physics/mesh/exactPredicates-selfcheck.mjs
//
// Run: node physics/mesh/exactPredicates-selfcheck.mjs
//
// BVH-CSG ROUND 16b: the gate for physics/mesh/exactPredicates.mjs. An exact predicate is wrong in one of two ways: the
// exact path miscomputes (a bad decomposition, a lost exponent), or the filter trusts a float sign it should not. So:
//   1. the decomposition: every double, subnormals included, is m x 2^e exactly;
//   2. the exact path against hand-built truths: exactly coplanar dyadic points give 0, a one-ULP nudge gives the sign
//      the cofactor says, the determinant's symmetries hold;
//   3. the filter never disagrees with the exact path -- on random points, and on points built to be nearly coplanar,
//      where the naive float sign is wrong (counted, as the control that the filter is needed).
//
// SABOTAGE LOG (round 16b) -- each applied to the real file, this gate, triTriIntersect-selfcheck and
// meshBoolean-selfcheck run, file restored and md5 verified. Reds are given as exactPredicates / triTriIntersect /
// meshBoolean:
//   X1 the filter bound set to 0 (every float sign trusted)                      3 / 0 / 0
//   X2 subnormals given exponent -1075                                           1 / 0 / 0
//        0 red on the first battery: a sign cannot see one wrong exponent applied to every subnormal alike. The
//        read-back row (m x 2^e === x) was added for it.
//   X3 the sign bit dropped in decompose                                         5 / 0 / 0
//   X4 triTriIntersectExact's side signs not negated (Shewchuk's orient3d is the opposite of Guigue-Devillers' dp)
//                                                                                0 / 2 / 1
//   X5 a crossing taken against a permuted triangle's plane, not the stored one  0 / 1 / 0
//   X7 meshBoolean ignoring opts.exactSeam                                       0 / 0 / 1
//   X8 exactSeam on by default                                                   0 / 0 / 4
//   Retired: X6, the exact-zero tie in the construct tests (>= 0 made > 0). At an exact zero the two candidate
//   crossings are the same geometric point, so either branch gives the right segment; there is no defect for a
//   gate to see.
"use strict";

import { orient3d, orient3dExact, decompose } from "./exactPredicates.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("exactPredicates-selfcheck -- orient3d, filtered and exact\n");
let s0 = 1616; const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
const P = (k = 1) => [(rnd() * 2 - 1) * k, (rnd() * 2 - 1) * k, (rnd() * 2 - 1) * k];
const naive = (a, b, c, d) => {
    const adx = a[0] - d[0], ady = a[1] - d[1], adz = a[2] - d[2], bdx = b[0] - d[0], bdy = b[1] - d[1], bdz = b[2] - d[2], cdx = c[0] - d[0], cdy = c[1] - d[1], cdz = c[2] - d[2];
    const det = adx * (bdy * cdz - bdz * cdy) + bdx * (cdy * adz - cdz * ady) + cdx * (ady * bdz - adz * bdy);
    return det > 0 ? 1 : det < 0 ? -1 : 0;
};
const ulpUp = (x) => { const f = new Float64Array([x]), u = new BigInt64Array(f.buffer); u[0] += x >= 0 ? 1n : -1n; return f[0]; };

console.log("1. *** THE DECOMPOSITION: x = m x 2^e, EXACTLY ***");
{
    // read back through the exact path itself: orient3d of a degenerate frame whose determinant is the coordinate times
    // a power of two -- a = (x,0,0), b = (0,1,0), c = (0,0,1), d = 0 gives det = x
    const xs = [1, -1, 0.1, -0.3, 1e-300, 5e-324, -5e-324, 2.2250738585072014e-308, 1.7976931348623157e308, 3 * 2 ** -1074, 0.5 + 2 ** -53];
    for (let i = 0; i < 2000; i++) xs.push((rnd() - 0.5) * 10 ** Math.floor(rnd() * 40 - 20));
    let bad = 0;
    for (const x of xs) if (orient3dExact([x, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 0]) !== Math.sign(x)) bad++;
    ok("!! the exact path gets the sign of det = x right for " + xs.length + " doubles, subnormals and the extremes included", bad === 0, bad + " wrong");
    // a sign cannot see a wrong exponent applied to every subnormal alike (it scales them all), so the decomposition is
    // read back directly: m x 2^e must BE x, bit for bit (m has at most 53 bits, so the product is exact)
    let back = 0;
    for (const x of xs) { const [m, e] = decompose(x); if (Number(m) * 2 ** e !== x) back++; }
    ok("!! every one of them is m x 2^e exactly, read back from the decomposition itself", back === 0, back + " wrong");
}

console.log("\n2. *** THE EXACT PATH AGAINST HAND-BUILT TRUTHS ***");
{
    // dyadic points ON the plane x + 2y + 4z = 1 (every coordinate a multiple of 2^-20, so the plane holds exactly)
    let zero = 0, n = 0, nudged = 0, nudgedRight = 0, naiveWrongNudge = 0;
    const dy = () => Math.round((rnd() * 2 - 1) * 2 ** 20) / 2 ** 20;
    const onPlane = () => { const y = dy(), z = dy(); return [1 - 2 * y - 4 * z, y, z]; };
    for (let i = 0; i < 3000; i++) {
        const a = onPlane(), b = onPlane(), c = onPlane(), d = onPlane();
        n++; if (orient3dExact(a, b, c, d) === 0 && orient3d(a, b, c, d) === 0) zero++;
        // nudge d by ONE ULP in x: off the plane by ~1e-16, unless the plane is parallel to x
        const d2 = [ulpUp(d[0]), d[1], d[2]], ex = orient3dExact(a, b, c, d2);
        if (ex !== 0) { nudged++; if (orient3d(a, b, c, d2) === ex) nudgedRight++; if (naive(a, b, c, d2) !== ex) naiveWrongNudge++; }
    }
    ok("!! " + n + " sets of four EXACTLY coplanar dyadic points: 0, every one", zero === n, zero + " of " + n);
    ok("!! each nudged by one ULP off the plane: off it (exactly nonzero) almost always, and the filtered sign is the exact sign", nudged > 0.9 * n && nudgedRight === nudged,
        nudgedRight + " of " + nudged + " nonzero; the naive float sign was wrong on " + naiveWrongNudge + " of them (the filter's reason to exist)");
    // symmetries of a determinant: swapping two of a, b, c flips the sign; a cyclic shift of a, b, c keeps it
    let sym = 0, m = 0;
    for (let i = 0; i < 5000; i++) {
        const a = P(), b = P(), c = P(), base = (rnd() < 0.5) ? onPlane() : P(), d = base;
        const s = orient3d(a, b, c, d);
        m++; if (orient3d(b, a, c, d) === -s && orient3d(a, c, b, d) === -s && orient3d(b, c, a, d) === s && orient3d(c, a, b, d) === s) sym++;
    }
    ok("   swapping two of a, b, c flips the sign and a cyclic shift keeps it (" + m + " sets)", sym === m, sym + " of " + m);
}

console.log("\n3. *** THE FILTER NEVER DISAGREES WITH THE EXACT PATH ***");
{
    orient3d.stats.filtered = 0; orient3d.stats.exact = 0;
    let bad = 0, n = 0;
    for (let i = 0; i < 100000; i++) { const a = P(), b = P(), c = P(), d = P(); n++; if (orient3d(a, b, c, d) !== orient3dExact(a, b, c, d)) bad++; }
    const f1 = orient3d.stats.filtered;
    ok("!! " + n + " random point sets: filtered sign = exact sign", bad === 0, bad + " disagree; filter decided " + f1 + " of " + n);
    // nearly coplanar: d built ON the plane abc in floating point (so off it by rounding), far from the origin too
    orient3d.stats.filtered = 0; orient3d.stats.exact = 0;
    let bad2 = 0, naiveWrong = 0, m = 0;
    for (const k of [1, 1e3, 1e-3]) for (let i = 0; i < 30000; i++) {
        const o = P(4 * k), a = P(k).map((x, j) => x + o[j]), b = P(k).map((x, j) => x + o[j]), c = P(k).map((x, j) => x + o[j]);
        const u = rnd(), v = rnd() * (1 - u);
        const d = [0, 1, 2].map((j) => a[j] + u * (b[j] - a[j]) + v * (c[j] - a[j]));
        const ex = orient3dExact(a, b, c, d);
        m++; if (orient3d(a, b, c, d) !== ex) bad2++; if (naive(a, b, c, d) !== ex) naiveWrong++;
    }
    ok("!! " + m + " nearly coplanar sets (three scales, off the origin): filtered sign = exact sign", bad2 === 0,
        bad2 + " disagree; the exact path decided " + orient3d.stats.exact + "; the NAIVE float sign was wrong on " + naiveWrong);
}

console.log(`\nexactPredicates-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails ? 1 : 0);
