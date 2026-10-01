// WebGLEngine/physics/mesh/implicitPoints-selfcheck.mjs
//
// Run: node physics/mesh/implicitPoints-selfcheck.mjs
//
// BVH-CSG ROUND 16f: the gate for physics/mesh/implicitPoints.mjs. An implicit point is wrong in one of four ways: its
// exact coordinates are not the crossing (a wrong formula, a lost sign or exponent); its rounding is not the nearest
// double; two descriptions of one point are not called the same (or two points that round alike are); or a filter trusts
// a float sign it should not. So:
//   1. rounding: N/D*2^E against IEEE division where that is exact, against ties built to be ties, and against the exact
//      half-ulp bound on big rationals;
//   2. the crossing: on its plane and on its line, exactly (in BigInt, from its own coordinates); a known answer;
//   3. identity: the same point from different edges, planes and vertex orders is the same; two points 2^-53 apart that
//      round alike are not; a crossing that IS an input vertex is that vertex;
//   4. orient2d and cmpCoord against the BigInt path, on random points and on points built EXACTLY collinear (crossings
//      of lines lying in one axis plane), where the naive float sign is wrong -- counted, as the control that the filter
//      is needed.
// SABOTAGE LOG (round 16f) -- in exactArrangement-selfcheck.mjs's header: 15 sabotages across implicitPoints.mjs,
// exactArrangement.mjs, meshBoolean.mjs and blastEngine.mjs, with this gate's red rows in their column.
"use strict";

import { explicitPoint, lpiPoint, lliPoint, tpiPoint, rationalPoint, centroidPoint, same, cmpCoord, orient2d, orient2dExact, ratToDouble,
         orient3dImplicit, orient3dImplicitExact, incircle, incircleExact, exactCoords, stats } from "./implicitPoints.mjs";
import { decompose, orient3dExact } from "./exactPredicates.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("implicitPoints-selfcheck -- implicit seam points and exact predicates on them\n");
let s0 = 1616; const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
const R3 = (k = 1) => [(rnd() * 2 - 1) * k, (rnd() * 2 - 1) * k, (rnd() * 2 - 1) * k];
// a double as an exact rational m*2^e
const asRat = (x) => decompose(x);

console.log("1. *** ROUNDING: EVERY COORDINATE IS THE NEAREST DOUBLE, TIES TO EVEN ***");
{
    let bad = 0;
    for (let i = 0; i < 20000; i++) {
        const a = Math.floor(rnd() * 2 ** 52) - 2 ** 51, b = Math.floor(rnd() * 2 ** 52) + 1;   // |a|,|b| < 2^53: a/b is IEEE-exactly rounded
        if (ratToDouble(BigInt(a), BigInt(b), 0) !== a / b) bad++;
    }
    ok("!! 20,000 quotients of integers below 2^53 round exactly as IEEE division does", bad === 0, bad + " differ");
    // ties: (2m+1)/2 * 2^e lies exactly between two doubles when 2m+1 has 54 bits; it must go to the even one
    let tieBad = 0;
    for (let i = 0; i < 2000; i++) {
        const m = (1n << 52n) + BigInt(Math.floor(rnd() * 2 ** 52)), N = 2n * m + 1n, e = Math.floor(rnd() * 40) - 20;
        const got = ratToDouble(N, 2n, e), lo = Number(m) * 2 ** e, hi = Number(m + 1n) * 2 ** e, even = m % 2n === 0n ? lo : hi;
        if (got !== even) tieBad++;
    }
    ok("!! 2,000 exact ties go to the even neighbour", tieBad === 0, tieBad + " wrong");
    // big rationals: |r - N/D| <= half an ulp of r, checked in BigInt
    let far = 0;
    for (let i = 0; i < 3000; i++) {
        const N = BigInt(Math.floor(rnd() * 2 ** 50)) * (1n << BigInt(Math.floor(rnd() * 200))) + BigInt(Math.floor(rnd() * 1000)) - 500n;
        const D = BigInt(Math.floor(rnd() * 2 ** 50) + 1) * (1n << BigInt(Math.floor(rnd() * 150))) + 1n, E = Math.floor(rnd() * 60) - 30;
        const r = ratToDouble(N, D, E), [m, e] = asRat(r);
        // r = m*2^e; N/D*2^E: compare 2|m*2^e*D - N*2^E| <= ulp(r)*D with ulp = 2^(e) for a 53-bit m (|m| >= 2^52)
        const lo = Math.min(e, E), A = m * D << BigInt(e - lo), B = N << BigInt(E - lo);
        const diff = A > B ? A - B : B - A, ulp = (m < 0n ? -m : m) >= (1n << 52n) ? 1n << BigInt(e - lo) : 0n;
        if (2n * diff > ulp * D) far++;
    }
    ok("!! 3,000 rationals of up to ~250 bits each: every rounding within half an ulp, checked exactly", far === 0, far + " beyond");
}

console.log("\n2. *** THE CROSSING: EXACTLY ON ITS PLANE AND ITS LINE ***");
{
    const P = lpiPoint([0.25, 0.5, -1], [0.25, 0.5, 3], [[0, 0, 0.5], [1, 0, 0.5], [0, 1, 0.5]]);
    ok("a known answer: the line x = 0.25, y = 0.5 meets the plane z = 0.5 at (0.25, 0.5, 0.5), bit for bit", P.r[0] === 0.25 && P.r[1] === 0.5 && P.r[2] === 0.5, P.r.join(", "));
    // random lines and planes: n.(X - p W) = 0 and (X - a W) x (b - a) = 0, in BigInt, from the point's own coordinates
    let offPlane = 0, offLine = 0, n = 0;
    const big = (p) => { const x = exactCoords(explicitPoint(p)); return x; };
    for (let i = 0; i < 3000; i++) {
        const T = [R3(), R3(), R3()], a = R3(2), b = R3(2);
        const side = (v) => { const u = [T[1][0] - T[0][0], T[1][1] - T[0][1], T[1][2] - T[0][2]], w = [T[2][0] - T[0][0], T[2][1] - T[0][1], T[2][2] - T[0][2]];
            const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; return Math.sign(nn[0] * (v[0] - T[0][0]) + nn[1] * (v[1] - T[0][1]) + nn[2] * (v[2] - T[0][2])); };
        if (side(a) * side(b) >= 0) continue;
        n++;
        const L = lpiPoint(a, b, T), x = exactCoords(L);
        // bring everything to one exponent
        const pts = [a, b, ...T].map(big);
        const E = Math.min(x.E, ...pts.map((q) => q.E));
        const sh = (q) => { const s = BigInt(q.E - E); return [q.X << s, q.Y << s, q.Z << s]; };
        const [A, B, P0, P1, P2] = pts.map(sh), X = sh(x), W = x.W;
        const u = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]], w = [P2[0] - P0[0], P2[1] - P0[1], P2[2] - P0[2]];
        const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const d = [X[0] - P0[0] * W, X[1] - P0[1] * W, X[2] - P0[2] * W];
        if (nn[0] * d[0] + nn[1] * d[1] + nn[2] * d[2] !== 0n) offPlane++;
        const e = [X[0] - A[0] * W, X[1] - A[1] * W, X[2] - A[2] * W], ba = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        if (e[1] * ba[2] - e[2] * ba[1] !== 0n || e[2] * ba[0] - e[0] * ba[2] !== 0n || e[0] * ba[1] - e[1] * ba[0] !== 0n) offLine++;
    }
    ok("!! " + n + " random crossings lie EXACTLY on their triangle's plane and on their line (BigInt, from their own coordinates)", offPlane === 0 && offLine === 0 && n > 1000,
        "off the plane " + offPlane + ", off the line " + offLine);
    // a plane z = c (dyadic) crossed by random lines: z is exactly c, so it rounds to c and compares equal to it
    let zBad = 0;
    for (let i = 0; i < 2000; i++) {
        const c = Math.round((rnd() - 0.5) * 64) / 64, a = R3(), b = R3();
        a[2] = c - 0.25 - rnd(); b[2] = c + 0.25 + rnd();
        const L = lpiPoint(a, b, [[0.3, 0.1, c], [0.9, 0.2, c], [0.1, 0.7, c]]);
        if (L.r[2] !== c || cmpCoord(L, explicitPoint([L.r[0], L.r[1], c]), 2) !== 0) zBad++;
    }
    ok("!! 2,000 crossings of the plane z = c have z exactly c -- rounded to it, and equal to it exactly", zBad === 0, zBad + " wrong");
}

console.log("\n3. *** IDENTITY: ONE POINT, MANY DESCRIPTIONS; TWO POINTS, ONE ROUNDING ***");
{
    // the same point from: the edge either way round, the plane's triangle in any vertex order, ANOTHER triangle in that
    // plane, and another stretch of the same line
    let differ = 0, n = 0;
    for (let i = 0; i < 1000; i++) {
        const q = (k) => Math.round((rnd() * 2 - 1) * 64) / 64 * k;            // dyadic, so the variants below are exact
        const T = [[q(1), q(1), q(1)], [q(1), q(1), q(1)], [q(1), q(1), q(1)]];
        const T2 = [T[0], T[2], [2 * T[1][0] - T[0][0], 2 * T[1][1] - T[0][1], 2 * T[1][2] - T[0][2]]];   // same plane
        const a = [q(2), q(2), q(2)], b = [q(2), q(2), q(2)], c = [2 * b[0] - a[0], 2 * b[1] - a[1], 2 * b[2] - a[2]];  // c on line ab
        const side = (v) => { const u = [T[1][0] - T[0][0], T[1][1] - T[0][1], T[1][2] - T[0][2]], w = [T[2][0] - T[0][0], T[2][1] - T[0][1], T[2][2] - T[0][2]];
            const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; return Math.sign(nn[0] * (v[0] - T[0][0]) + nn[1] * (v[1] - T[0][1]) + nn[2] * (v[2] - T[0][2])); };
        if (side(a) * side(b) >= 0 || side(a) * side(c) >= 0) continue;
        n++;
        const P = lpiPoint(a, b, T), vs = [lpiPoint(b, a, T), lpiPoint(a, b, [T[1], T[2], T[0]]), lpiPoint(a, b, [T[0], T[2], T[1]]), lpiPoint(a, b, T2), lpiPoint(a, c, T)];
        for (const Q of vs) if (!same(P, Q) || Q.r.some((x, k) => x !== P.r[k])) differ++;
    }
    ok("!! " + n + " points, each from five other descriptions (edge reversed, plane's vertices rotated and reflected, another triangle in the plane, another stretch of the line): the same point and the same bits",
        differ === 0 && n > 300, differ + " differ");
    // two points that round alike: x = 1 + 2^-53 (a tie, rounded to 1) and x = 1
    const P1 = lpiPoint([1, 0, -1], [1 + 2 ** -52, 0, 1], [[0, 0, 0], [1, 0, 0], [0, 1, 0]]), P2 = lpiPoint([1, 0, -1], [1, 0, 1], [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
    ok("!! x = 1 + 2^-53 and x = 1 round to the same bits but are not the same point; cmpCoord orders them", P1.r[0] === 1 && P2.r[0] === 1 && !same(P1, P2) && cmpCoord(P1, P2, 0) === 1 && cmpCoord(P2, P1, 0) === -1,
        "rounded " + P1.r[0] + " / " + P2.r[0] + ", same " + same(P1, P2) + ", cmp " + cmpCoord(P1, P2, 0));
    // a crossing that is an input vertex
    const V = lpiPoint([0.3, 0.7, -0.5], [0.3, 0.7, 0.25], [[0, 0, 0], [2, 0, 0], [0, 2, 0]]);
    ok("a crossing that lands exactly on an input point is that point", same(V, explicitPoint([0.3, 0.7, 0])), V.r.join(", "));
    const C = centroidPoint(explicitPoint([0, 0, 0]), explicitPoint([1, 0, 0]), explicitPoint([0, 1, 0])), x = exactCoords(C);
    // x = X*2^E/W = 1/3 exactly: 3 X 2^E = W
    const third = x.E >= 0 ? (3n * x.X) << BigInt(x.E) === x.W : 3n * x.X === x.W << BigInt(-x.E);
    ok("a centroid, exactly: x = 1/3 in BigInt, and (1/3, 1/3, 0) rounded to the nearest doubles", third && C.r[0] === 1 / 3 && C.r[1] === 1 / 3 && C.r[2] === 0, C.r.join(", "));
}

console.log("\n4. *** orient2d AND cmpCoord: THE FILTER NEVER DISAGREES WITH THE EXACT PATH ***");
{
    let bad = 0, n = 0;
    for (let i = 0; i < 4000; i++) {
        const T = [R3(), R3(), R3()];
        const mk = () => { for (;;) { const a = R3(2), b = R3(2); try { return lpiPoint(a, b, T); } catch { /* parallel: retry */ } } };
        const P = [mk(), mk(), explicitPoint(R3())];
        for (const [i0, j0] of [[0, 1], [1, 2], [2, 0]]) { n++; if (orient2d(P[0], P[1], P[2], i0, j0) !== orient2dExact(P[0], P[1], P[2], i0, j0)) bad++; }
    }
    ok("!! random implicit and input points: orient2d (filtered) equals the BigInt path in " + n + " of " + n + " projections", bad === 0, bad + " differ");
    // EXACTLY collinear: lines lying in the plane y = c cross a random plane T on the line T n {y = c}
    let wrong = 0, naiveWrong = 0, m = 0, tilted = 0, tiltBad = 0;
    for (let i = 0; i < 2000; i++) {
        const c = Math.round((rnd() - 0.5) * 32) / 32, T = [R3(), R3(), R3()];
        const line = () => { const a = R3(2), b = R3(2); a[1] = c; b[1] = c; return [a, b]; };
        const pts = [];
        for (let k = 0; k < 6 && pts.length < 3; k++) { const [a, b] = line(); try { pts.push(lpiPoint(a, b, T)); } catch { /* parallel */ } }
        if (pts.length < 3) continue;
        // (a line need not cross T between its two points: lpiPoint gives where the LINE meets the plane, still on both)
        m++;
        const o = orient2d(pts[0], pts[1], pts[2], 2, 0);
        if (o !== 0) wrong++;
        const r = pts.map((p) => p.r), nv = (r[1][2] - r[0][2]) * (r[2][0] - r[0][0]) - (r[1][0] - r[0][0]) * (r[2][2] - r[0][2]);
        if (nv !== 0) naiveWrong++;
        // a tilt of one line by an ulp in y: no longer collinear; the filter must agree with the exact path either way
        const [a, b] = line(); a[1] = c + 2 ** -40; tilted++;
        try { const Q = lpiPoint(a, b, T); if (orient2d(pts[0], pts[1], Q, 2, 0) !== orient2dExact(pts[0], pts[1], Q, 2, 0)) tiltBad++; } catch { tilted--; }
    }
    ok("!! " + m + " triples of crossings built exactly collinear: orient2d is 0 for every one", wrong === 0 && m > 1000, wrong + " nonzero");
    ok("   control: the naive float orientation of their rounded coordinates is nonzero for many of them", naiveWrong > 0, naiveWrong + " of " + m);
    ok("!! " + tilted + " of them with one line tilted 2^-40: the filter agrees with the BigInt path", tiltBad === 0, tiltBad + " differ");
    let cmpBad = 0;
    for (let i = 0; i < 3000; i++) {
        const T = [R3(), R3(), R3()];
        let P, Q;
        try { P = lpiPoint(R3(2), R3(2), T); Q = lpiPoint(R3(2), R3(2), T); } catch { continue; }
        for (let k = 0; k < 3; k++) {
            const x = exactCoords(P), y = exactCoords(Q), E = Math.min(x.E, y.E), K = ["X", "Y", "Z"][k];
            const s = (x[K] << BigInt(x.E - E)) * y.W - (y[K] << BigInt(y.E - E)) * x.W;
            if (cmpCoord(P, Q, k) !== (s > 0n ? 1 : s < 0n ? -1 : 0)) cmpBad++;
        }
    }
    ok("!! cmpCoord equals the BigInt comparison on 9,000 coordinates of random crossings", cmpBad === 0, cmpBad + " differ");
    console.log("  ....  stats: " + stats.lpi + " crossings built, " + stats.filtered + " predicates decided by the filter, " + stats.exact + " in BigInt");
}

console.log("\n5. *** THE OTHER POINTS AND PREDICATES: TWO COPLANAR LINES, THREE PLANES, orient3d, IN-CIRCLE ***");
{
    // three-plane points: on every one of the three planes, exactly (orient3d in BigInt against each triangle)
    const P = tpiPoint([[0.25, 0, 0], [0.25, 1, 0], [0.25, 0, 1]], [[0, 0.5, 0], [0, 0.5, 1], [1, 0.5, 0]], [[0, 0, 0.75], [1, 0, 0.75], [0, 1, 0.75]]);
    ok("a known three-plane point: x = 0.25, y = 0.5, z = 0.75 meet at (0.25, 0.5, 0.75), bit for bit", P.r.join() === "0.25,0.5,0.75", P.r.join(", "));
    let off = 0;
    for (let i = 0; i < 1500; i++) { const T = [0, 1, 2].map(() => [R3(), R3(), R3()]), X = tpiPoint(...T); for (const t of T) if (orient3dImplicitExact(...t.map(explicitPoint), X) !== 0) off++; }
    ok("!! 1,500 random three-plane points lie exactly on all three planes", off === 0, off + " off a plane");
    // two coplanar lines (all four points in the plane y = c, dyadic): the crossing lies on both lines, exactly
    let offL = 0, n = 0;
    for (let i = 0; i < 1500; i++) {
        const c = Math.round((rnd() - 0.5) * 32) / 32, pt = () => { const p = R3(); p[1] = c; return p; }, a = pt(), b = pt(), d0 = pt(), d1 = pt();
        let X; try { X = lliPoint(a, b, d0, d1, 2, 0); } catch { continue; }
        n++;
        // collinear with a, b and with d0, d1: orient2d in the (z, x) projection, exactly -- and y exactly c
        if (orient2dExact(explicitPoint(a), explicitPoint(b), X, 2, 0) !== 0 || orient2dExact(explicitPoint(d0), explicitPoint(d1), X, 2, 0) !== 0 || cmpCoord(X, explicitPoint([0, c, 0]), 1) !== 0) offL++;
    }
    ok("!! " + n + " crossings of two coplanar lines lie exactly on both lines and in their plane", offL === 0 && n > 1000, offL + " off");
    // orient3d on implicit points: the BigInt path against exactPredicates.mjs on input points; the filter against it on crossings
    let o3 = 0, o3f = 0;
    for (let i = 0; i < 4000; i++) { const q = [R3(), R3(), R3(), R3()]; if (orient3dImplicitExact(...q.map(explicitPoint)) !== orient3dExact(...q)) o3++; }
    for (let i = 0; i < 3000; i++) { const T = [R3(), R3(), R3()]; let L; try { L = lpiPoint(R3(2), R3(2), T); } catch { continue; } const q = [explicitPoint(R3()), explicitPoint(R3()), explicitPoint(R3()), L]; if (orient3dImplicit(...q) !== orient3dImplicitExact(...q)) o3f++; }
    // a crossing lies on its own plane: orient3d against that triangle is exactly 0, though the rounded point is off it
    let onOwn = 0;
    for (let i = 0; i < 2000; i++) { const T = [R3(), R3(), R3()]; let L; try { L = lpiPoint(R3(2), R3(2), T); } catch { continue; } if (orient3dImplicit(...T.map(explicitPoint), L) !== 0) onOwn++; }
    ok("!! orient3d on implicit points: the BigInt path equals exactPredicates.mjs's on 4,000 input quadruples, the filter equals the BigInt path with a crossing, and every crossing is exactly ON its own plane",
        o3 === 0 && o3f === 0 && onOwn === 0, o3 + " / " + o3f + " differ, " + onOwn + " crossings off their plane");
    // in-circle: integer points on the circle of radius 5 (exactly cocircular), one inside, one outside; the filter
    // against the BigInt path at random and on crossings
    const E = (x, y) => explicitPoint([x, y, 0]);
    const circ = [incircle(E(5, 0), E(3, 4), E(-4, 3), E(0, -5), 0, 1), incircle(E(5, 0), E(3, 4), E(-4, 3), E(1, 1), 0, 1), incircle(E(5, 0), E(3, 4), E(-4, 3), E(6, 6), 0, 1), incircle(E(-4, 3), E(3, 4), E(5, 0), E(1, 1), 0, 1)];
    ok("in-circle: a fourth point on the circle 0, inside +1, outside -1, inside a clockwise triple -1", circ.join() === "0,1,-1,-1", circ.join(", "));
    let ic = 0, icn = 0;
    for (let i = 0; i < 6000; i++) { const q = [0, 1, 2, 3].map(() => E(rnd() * 2 - 1, rnd() * 2 - 1)); icn++; if (incircle(...q, 0, 1) !== incircleExact(...q, 0, 1)) ic++; }
    const T = [[0, 0, 0.5], [1, 0, 0.5], [0, 1, 0.5]];
    for (let i = 0; i < 3000; i++) { const q = [0, 1, 2, 3].map(() => lpiPoint([rnd() * 2 - 1, rnd() * 2 - 1, -1], [rnd() * 2 - 1, rnd() * 2 - 1, 2], T)); icn++; if (incircle(...q, 0, 1) !== incircleExact(...q, 0, 1)) ic++; }
    ok("!! in-circle: the filter equals the BigInt path on " + icn + " quadruples, input points and crossings", ic === 0, ic + " differ");
}

console.log(`\nimplicitPoints-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: the filters' error bounds are argued (a running bound with a margin), not " +
    "proved by a tool as Cherchi et al.'s static ones are -- the gate checks them against the BigInt path on random and " +
    "built-degenerate inputs only; and the BigInt path is slow, reached only where a filter cannot decide.");
process.exit(fails ? 1 : 0);
