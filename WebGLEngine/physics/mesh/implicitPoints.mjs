// WebGLEngine/physics/mesh/implicitPoints.mjs
//
// *** BVH-CSG ROUND 16f: SEAM POINTS KEPT EXACT -- IMPLICIT POINTS AND THE PREDICATES ON THEM. *** Every seam point the
// arrangement makes is where an EDGE of one mesh crosses the PLANE of a triangle of the other (triTriIntersect.mjs's
// construct() already builds them so, from the raw distances). Round 16e measured that what breaks the near-coincident
// family is not the pair verdicts but the arrangement's 1e-9 decisions on the seam points those verdicts give -- vertex
// merging, side splitting, crossing detection -- and named the textbook route: keep such points IMPLICIT and decide every
// predicate on them exactly, rounding coordinates only on output (Cherchi, Livesu, Scateni & Attene, "Fast and Robust
// Mesh Arrangements using Floating-point Arithmetic", SIGGRAPH Asia 2020). This file is that base:
//
//   explicitPoint(p)        an input vertex
//   lpiPoint(a, b, T)       the line through a, b met by the plane of triangle T -- exact; a and b must lie strictly on
//                           opposite sides of that plane (the caller has the exact signs)
//   lliPoint(a, b, c, d, i, j)  two coplanar lines crossing (a coplanar pair's edges)
//   tpiPoint(T1, T2, T3)    three triangles' planes meeting (two seams crossing: the other mesh crossing itself)
//   rationalPoint(X,Y,Z,W,E) any point given exactly, coordinates X*2^E/W (BigInt, W > 0); centroidPoint(P, Q, R)
//
// and on any of them, exactly:
//   same(P, Q)              the same point
//   cmpCoord(P, Q, k)       sign of P[k] - Q[k]
//   orient2d(P, Q, R, i, j) sign of the 2D orientation of the three points projected on axes (i, j)
//   orient3dImplicit(A,B,C,D) Shewchuk's orient3d on any four points; incircle(P, Q, R, S, i, j) his in-circle, projected
//   rounded(P)              each coordinate rounded to the nearest double (ties to even) -- ONE value per point, so two
//                           arrangements that meet the same point, from any two descriptions of it, get the same bits
//
// HOW. Every point carries its exact homogeneous coordinates (BigInt X, Y, Z over W > 0, scaled by 2^E: each input double
// is m x 2^e, exactPredicates.mjs's decompose(), brought to one exponent) and the correctly rounded doubles. A predicate
// tries the rounded doubles first, under a bound that is rigorous for them: rounding is monotone, so rounded coordinates
// that differ order the exact ones the same way; and orient2d's filter carries each implicit point's half-ulp per
// coordinate through a running error bound (explicit points carry none). Only what the filter cannot decide is computed
// in BigInt (stats counts both).
"use strict";

import { decompose } from "./exactPredicates.mjs";

export const stats = { lpi: 0, lli: 0, tpi: 0, filtered: 0, exact: 0 };
const U = 2 ** -53;

// ---- exact arithmetic helpers --------------------------------------------------------------------------------------
function bitLen(n) {           // n > 0n
    const h = n.toString(16);
    return (h.length - 1) * 4 + (32 - Math.clz32(parseInt(h[0], 16)));
}
// N / D * 2^E, rounded to the nearest double, ties to even (D > 0). Number(BigInt) rounds to nearest-even; the quotient is
// taken to ~65 bits and the remainder folded into a sticky bit below them, so that one rounding is the only rounding.
export function ratToDouble(N, D, E) {
    if (N === 0n) return 0;
    const neg = N < 0n;
    if (neg) N = -N;
    const s = 64 - (bitLen(N) - bitLen(D));
    let q, r;
    if (s >= 0) { const NN = N << BigInt(s); q = NN / D; r = NN % D; }
    else { const DD = D << BigInt(-s); q = N / DD; r = N % DD; }
    let v = Number((q << 1n) | (r !== 0n ? 1n : 0n)), m = E - s - 1;
    // scale by 2^m in steps that keep v normal (v ~ 2^66 here; the result itself is never subnormal in this engine's range)
    while (m > 900) { v *= 2 ** 900; m -= 900; }
    while (m < -900) { v *= 2 ** -900; m += 900; }
    v *= 2 ** m;
    return neg ? -v : v;
}
// integers of a list of doubles at one exponent: x_i = I_i * 2^E exactly
function toInts(xs) {
    const parts = xs.map(decompose);
    let E = Infinity;
    for (const [m, e] of parts) if (m !== 0n && e < E) E = e;
    if (E === Infinity) E = 0;
    return { I: parts.map(([m, e]) => (m === 0n ? 0n : m << BigInt(e - E))), E };
}
const halfUlp = (x) => { const a = Math.abs(x); if (a === 0) return 0; const e = Math.floor(Math.log2(a)); return 2 ** (Math.max(e, -1022) - 53) * 2; };

function finish(pt) {
    const { X, Y, Z, W, E } = pt.x;
    pt.r = [ratToDouble(X, W, E), ratToDouble(Y, W, E), ratToDouble(Z, W, E)];
    // a bound on |rounded - exact| per coordinate: half an ulp of the rounded value (twice that, to be safe at a power of 2)
    pt.d = Math.max(halfUlp(pt.r[0]), halfUlp(pt.r[1]), halfUlp(pt.r[2]));
    return pt;
}

// ---- the points ------------------------------------------------------------------------------------------------------
/** An input vertex: exact as given. */
export function explicitPoint(p) {
    return { kind: "explicit", r: p, d: 0, x: null, src: p };
}
function exactOf(P) {
    if (P.x) return P.x;
    const { I, E } = toInts(P.r);
    P.x = { X: I[0], Y: I[1], Z: I[2], W: 1n, E };
    return P.x;
}
/**
 * The point where the line through a, b meets the plane of triangle T = [p, q, r] -- exactly. The caller guarantees a
 * and b lie strictly on opposite sides of that plane (exact signs), so the line is not parallel to it.
 */
export function lpiPoint(a, b, T) {
    stats.lpi++;
    const [p, q, r] = T;
    const { I, E } = toInts([...a, ...b, ...p, ...q, ...r]);
    const A = I.slice(0, 3), B = I.slice(3, 6), P = I.slice(6, 9), Q = I.slice(9, 12), R = I.slice(12, 15);
    const u = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]], v = [R[0] - P[0], R[1] - P[1], R[2] - P[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ba = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], pa = [P[0] - A[0], P[1] - A[1], P[2] - A[2]];
    let d = n[0] * ba[0] + n[1] * ba[1] + n[2] * ba[2];
    const tn = n[0] * pa[0] + n[1] * pa[1] + n[2] * pa[2];
    if (d === 0n) throw new Error("implicitPoints: lpiPoint of a line parallel to the plane");
    // point = A + BA * tn / d, all at scale 2^E: homogeneous (A d + BA tn, d)
    let X = A[0] * d + ba[0] * tn, Y = A[1] * d + ba[1] * tn, Z = A[2] * d + ba[2] * tn;
    if (d < 0n) { X = -X; Y = -Y; Z = -Z; d = -d; }
    return finish({ kind: "lpi", x: { X, Y, Z, W: d, E }, src: { a, b, T } });
}
/**
 * The point where two COPLANAR lines cross -- the line through a, b and the line through c, d, lying exactly in one plane
 * whose projection on axes (i, j) is not flat -- exactly. (A coplanar pair's edges crossing: round 16f.) The lines must
 * not be parallel in that projection.
 */
export function lliPoint(a, b, c, d, i, j) {
    stats.lli++;
    const { I, E } = toInts([...a, ...b, ...c, ...d]);
    const A = I.slice(0, 3), B = I.slice(3, 6), C = I.slice(6, 9), D = I.slice(9, 12);
    const ba = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], dc = [D[0] - C[0], D[1] - C[1], D[2] - C[2]], ca = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let den = ba[i] * dc[j] - ba[j] * dc[i];
    const num = ca[i] * dc[j] - ca[j] * dc[i];
    if (den === 0n) throw new Error("implicitPoints: lliPoint of parallel lines");
    let X = A[0] * den + ba[0] * num, Y = A[1] * den + ba[1] * num, Z = A[2] * den + ba[2] * num;
    if (den < 0n) { X = -X; Y = -Y; Z = -Z; den = -den; }
    return finish({ kind: "lli", x: { X, Y, Z, W: den, E }, src: { a, b, c, d } });
}
/**
 * The point where the planes of three triangles meet, exactly (Cramer's rule in BigInt): x = (d1 (n2 x n3) + d2 (n3 x n1)
 * + d3 (n1 x n2)) / (n1 . (n2 x n3)), n_k = (b - a) x (c - a), d_k = n_k . a. (Two seams crossing inside a triangle --
 * the other mesh crossing itself, by a rounding: round 16f.) The planes must be independent.
 */
export function tpiPoint(T1, T2, T3) {
    stats.tpi++;
    const { I, E } = toInts([...T1.flat(), ...T2.flat(), ...T3.flat()]);
    const tri = (o) => [I.slice(o, o + 3), I.slice(o + 3, o + 6), I.slice(o + 6, o + 9)];
    const plane = ([a, b, c]) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; return [n, n[0] * a[0] + n[1] * a[1] + n[2] * a[2]]; };
    const x3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const [n1, d1] = plane(tri(0)), [n2, d2] = plane(tri(9)), [n3, d3] = plane(tri(18));
    const c23 = x3(n2, n3), c31 = x3(n3, n1), c12 = x3(n1, n2);
    let W = n1[0] * c23[0] + n1[1] * c23[1] + n1[2] * c23[2];
    if (W === 0n) throw new Error("implicitPoints: tpiPoint of dependent planes");
    let X = d1 * c23[0] + d2 * c31[0] + d3 * c12[0], Y = d1 * c23[1] + d2 * c31[1] + d3 * c12[1], Z = d1 * c23[2] + d2 * c31[2] + d3 * c12[2];
    if (W < 0n) { X = -X; Y = -Y; Z = -Z; W = -W; }
    return finish({ kind: "tpi", x: { X, Y, Z, W, E }, src: { T1, T2, T3 } });
}
/** A point given exactly: coordinates X*2^E/W (BigInt, W > 0). */
export function rationalPoint(X, Y, Z, W, E) {
    if (W < 0n) { X = -X; Y = -Y; Z = -Z; W = -W; }
    return finish({ kind: "rational", x: { X, Y, Z, W, E } });
}
// several points' exact coordinates at one exponent
function common(...Ps) {
    const xs = Ps.map(exactOf);
    let E = Infinity;
    for (const x of xs) if (x.E < E) E = x.E;
    return { E, xs: xs.map((x) => { const s = BigInt(x.E - E); return s ? { X: x.X << s, Y: x.Y << s, Z: x.Z << s, W: x.W } : x; }) };
}
/** The centroid of three points, exactly. */
export function centroidPoint(P, Q, R) {
    const { E, xs: [p, q, r] } = common(P, Q, R);
    const w1 = q.W * r.W, w2 = p.W * r.W, w3 = p.W * q.W;
    return rationalPoint(p.X * w1 + q.X * w2 + r.X * w3, p.Y * w1 + q.Y * w2 + r.Y * w3, p.Z * w1 + q.Z * w2 + r.Z * w3, 3n * p.W * q.W * r.W, E);
}

// ---- the predicates --------------------------------------------------------------------------------------------------
const AX = ["X", "Y", "Z"];
/** The sign of P[k] - Q[k], exactly. */
export function cmpCoord(P, Q, k) {
    const a = P.r[k], b = Q.r[k];
    if (a < b) { stats.filtered++; return -1; }     // rounding is monotone: differing rounded values order the exact ones
    if (a > b) { stats.filtered++; return 1; }
    if (P.kind === "explicit" && Q.kind === "explicit") { stats.filtered++; return 0; }
    stats.exact++;
    const { xs: [p, q] } = common(P, Q), K = AX[k];
    const s = p[K] * q.W - q[K] * p.W;
    return s > 0n ? 1 : s < 0n ? -1 : 0;
}
/** The same point, exactly. */
export function same(P, Q) {
    if (P === Q) return true;
    if (P.r[0] !== Q.r[0] || P.r[1] !== Q.r[1] || P.r[2] !== Q.r[2]) return false;
    if (P.kind === "explicit" && Q.kind === "explicit") return true;
    return cmpCoord(P, Q, 0) === 0 && cmpCoord(P, Q, 1) === 0 && cmpCoord(P, Q, 2) === 0;
}
/**
 * The orientation of P, Q, R projected on axes (i, j): +1 counter-clockwise, -1 clockwise, 0 collinear -- exactly.
 * The filter: det = (qi-pi)(rj-pj) - (qj-pj)(ri-pi) on the rounded coordinates, with a running bound on its error from
 * each point's own bound (half an ulp per coordinate of an implicit point, none for an input vertex) and every rounding.
 */
export function orient2d(P, Q, R, i, j) {
    const px = P.r[i], py = P.r[j], qx = Q.r[i], qy = Q.r[j], rx = R.r[i], ry = R.r[j];
    const dp = P.d, dq = Q.d, dr = R.d;
    const a = qx - px, b = ry - py, c = qy - py, e = rx - px;
    const ea = dq + dp + U * Math.abs(a), eb = dr + dp + U * Math.abs(b);
    const ec = dq + dp + U * Math.abs(c), ee = dr + dp + U * Math.abs(e);
    const m1 = a * b, m2 = c * e, det = m1 - m2;
    const err = ((Math.abs(a) * eb + Math.abs(b) * ea + ea * eb + U * Math.abs(m1)) +
                 (Math.abs(c) * ee + Math.abs(e) * ec + ec * ee + U * Math.abs(m2)) + U * Math.abs(det)) * (1 + 32 * U) + 1e-300;
    if (det > err) { stats.filtered++; return 1; }
    if (-det > err) { stats.filtered++; return -1; }
    return orient2dExact(P, Q, R, i, j);
}
/** orient2d, always in BigInt (exported for the gate). */
export function orient2dExact(P, Q, R, i, j) {
    stats.exact++;
    const { xs: [p, q, r] } = common(P, Q, R), I = AX[i], J = AX[j];
    const det = p[I] * (q[J] * r.W - r[J] * q.W) - p[J] * (q[I] * r.W - r[I] * q.W) + p.W * (q[I] * r[J] - r[I] * q[J]);
    return det > 0n ? 1 : det < 0n ? -1 : 0;
}
/**
 * The sign of det[a - d; b - d; c - d] for any four points (Shewchuk's orient3d convention, as exactPredicates.mjs's):
 * the filter is the determinant of the rounded coordinates under a running error bound that carries each point's own
 * bound; otherwise the 4x4 homogeneous determinant in BigInt (every W > 0, so its sign is the answer).
 */
export function orient3dImplicit(A, B, C, D) {
    const a = [A.r[0] - D.r[0], A.r[1] - D.r[1], A.r[2] - D.r[2]], b = [B.r[0] - D.r[0], B.r[1] - D.r[1], B.r[2] - D.r[2]], c = [C.r[0] - D.r[0], C.r[1] - D.r[1], C.r[2] - D.r[2]];
    const ea = a.map((x) => A.d + D.d + U * Math.abs(x)), eb = b.map((x) => B.d + D.d + U * Math.abs(x)), ec = c.map((x) => C.d + D.d + U * Math.abs(x));
    // m = b x c with errors, then a . m
    const prod = (x, ex, y, ey) => [x * y, Math.abs(x) * ey + Math.abs(y) * ex + ex * ey + U * Math.abs(x * y)];
    const minus = ([p, ep], [q, eq]) => { const r = p - q; return [r, ep + eq + U * Math.abs(r)]; };
    const m0 = minus(prod(b[1], eb[1], c[2], ec[2]), prod(b[2], eb[2], c[1], ec[1]));
    const m1 = minus(prod(b[2], eb[2], c[0], ec[0]), prod(b[0], eb[0], c[2], ec[2]));
    const m2 = minus(prod(b[0], eb[0], c[1], ec[1]), prod(b[1], eb[1], c[0], ec[0]));
    const t0 = prod(a[0], ea[0], m0[0], m0[1]), t1 = prod(a[1], ea[1], m1[0], m1[1]), t2 = prod(a[2], ea[2], m2[0], m2[1]);
    const s01 = t0[0] + t1[0], det = s01 + t2[0];
    const err = (t0[1] + t1[1] + t2[1] + U * Math.abs(s01) + U * Math.abs(det)) * (1 + 64 * U) + 1e-300;
    if (det > err) { stats.filtered++; return 1; }
    if (-det > err) { stats.filtered++; return -1; }
    return orient3dImplicitExact(A, B, C, D);
}
/** orient3dImplicit, always in BigInt (exported for the gate). */
export function orient3dImplicitExact(A, B, C, D) {
    stats.exact++;
    const { xs: [p, q, r, t] } = common(A, B, C, D);
    // det of rows [X Y Z W] (a homogeneous point each) = W_a W_b W_c W_d x det[a - d; b - d; c - d]
    const M = [p, q, r, t].map((x) => [x.X, x.Y, x.Z, x.W]);
    const det3 = (m, c0, c1, c2, r0, r1, r2) => m[r0][c0] * (m[r1][c1] * m[r2][c2] - m[r1][c2] * m[r2][c1]) - m[r0][c1] * (m[r1][c0] * m[r2][c2] - m[r1][c2] * m[r2][c0]) + m[r0][c2] * (m[r1][c0] * m[r2][c1] - m[r1][c1] * m[r2][c0]);
    // expand along the W column
    const D4 = -M[0][3] * det3(M, 0, 1, 2, 1, 2, 3) + M[1][3] * det3(M, 0, 1, 2, 0, 2, 3) - M[2][3] * det3(M, 0, 1, 2, 0, 1, 3) + M[3][3] * det3(M, 0, 1, 2, 0, 1, 2);
    return D4 > 0n ? 1 : D4 < 0n ? -1 : 0;
}
/**
 * In-circle on axes (i, j): positive when S lies strictly inside the circle through P, Q, R taken counter-clockwise in
 * (i, j) (negative outside, 0 on it) -- Shewchuk's incircle, exactly. Filter: the 3x3 lifted determinant of the rounded
 * coordinates relative to S under a running error bound; otherwise BigInt, each row scaled by (W_row W_S)^2 > 0.
 */
export function incircle(P, Q, R, S, i, j) {
    const sx = S.r[i], sy = S.r[j], dS = S.d;
    const rel = (A) => { const x = A.r[i] - sx, y = A.r[j] - sy, e = A.d + dS; return [x, e + U * Math.abs(x), y, e + U * Math.abs(y)]; };
    const mul = (a, ea, b, eb) => { const v = a * b; return [v, Math.abs(a) * eb + Math.abs(b) * ea + ea * eb + U * Math.abs(v)]; };
    const add = (a, ea, b, eb) => { const v = a + b; return [v, ea + eb + U * Math.abs(v)]; };
    const sub2 = (a, ea, b, eb) => { const v = a - b; return [v, ea + eb + U * Math.abs(v)]; };
    const [ax, eax, ay, eay] = rel(P), [bx, ebx, by, eby] = rel(Q), [cx, ecx, cy, ecy] = rel(R);
    const lift = (x, ex, y, ey) => add(...mul(x, ex, x, ex), ...mul(y, ey, y, ey));
    const [al, eal] = lift(ax, eax, ay, eay), [bl, ebl] = lift(bx, ebx, by, eby), [cl, ecl] = lift(cx, ecx, cy, ecy);
    const m1 = sub2(...mul(bx, ebx, cy, ecy), ...mul(cx, ecx, by, eby));
    const m2 = sub2(...mul(cx, ecx, ay, eay), ...mul(ax, eax, cy, ecy));
    const m3 = sub2(...mul(ax, eax, by, eby), ...mul(bx, ebx, ay, eay));
    const t1 = mul(al, eal, ...m1), t2 = mul(bl, ebl, ...m2), t3 = mul(cl, ecl, ...m3);
    const [det, err0] = add(...add(...t1, ...t2), ...t3);
    const err = err0 * (1 + 64 * U) + 1e-300;
    if (det > err) { stats.filtered++; return 1; }
    if (-det > err) { stats.filtered++; return -1; }
    return incircleExact(P, Q, R, S, i, j);
}
/** incircle, always in BigInt (exported for the gate). */
export function incircleExact(P, Q, R, S, i, j) {
    stats.exact++;
    const { xs: [a, b, c, d] } = common(P, Q, R, S), I = AX[i], J = AX[j];
    const row = (A) => { const ww = A.W * d.W, x = A[I] * d.W - d[I] * A.W, y = A[J] * d.W - d[J] * A.W; return [x * ww, y * ww, x * x + y * y]; };
    const [ra, rb, rc] = [row(a), row(b), row(c)];
    const det = ra[2] * (rb[0] * rc[1] - rc[0] * rb[1]) + rb[2] * (rc[0] * ra[1] - ra[0] * rc[1]) + rc[2] * (ra[0] * rb[1] - rb[0] * ra[1]);
    return det > 0n ? 1 : det < 0n ? -1 : 0;
}
/** The point's coordinates, each rounded to the nearest double. */
export function rounded(P) { return P.r; }
/** The point's exact coordinates as {X, Y, Z, W, E}: X*2^E/W (exported for the gate). */
export function exactCoords(P) { return exactOf(P); }
