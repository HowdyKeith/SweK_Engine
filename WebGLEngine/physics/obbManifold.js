// WebGLEngine/physics/obbManifold.js
//
// A FULL CONTACT MANIFOLD (up to 4 points) for two touching OBBs, closing the gap physics/mechanics/
// rigidBody6dofCollision.mjs's own header has named since its first round: "a full manifold needs polygon
// clipping, out of scope for this first slice." Pure OBB geometry (no mass/inertia/rigidBody6dof concepts) --
// lives beside physics/obbOverlap.js, not under mechanics/, and NEVER modifies obbOverlap.js itself (that file
// is a carefully-proven, cross-arch-deterministic primitive with its own gate and its own wide blast radius;
// this file only re-derives, from obbContact()'s own {normal, depth} output plus each box's own {center, half,
// axes}, information obbContact() does not expose for free -- which of the 15 SAT axes actually won).
//
// THE ALGORITHM is the standard technique for box-box manifold generation (Box2D's b2CollidePolygons, Bullet's
// box-box collision, Ericson's "Real-Time Collision Detection" 4.4, Dirk Gregorius' GDC contact-manifold-
// reduction talks) -- not invented here, but independently derived and checked in a standalone scratch script
// (hand-placed flush/partial/twisted face-face geometries with known corner counts and depths, a genuinely
// tilted edge-edge case, a forced-empty-clip fallback, a synthetic dedupe case, and a 500-trial random-
// orientation sweep) BEFORE being written into this file, the same discipline every other formula in this tree
// has been held to.
//
// STEP 1 -- AXIS CATEGORIZATION (classifyAxis()). Given contact.normal (already unit-length: for a face axis
// it IS one of a.axes[i]/b.axes[j] verbatim or negated; for a cross-product axis obbContact()'s own consider()
// already normalizes it), compute cosA[i]=dot(normal,a.axes[i]) and cosB[j]=dot(normal,b.axes[j]). A genuine
// face-axis match lands at |cos| = 1 - O(1e-15) (the one 1/sqrt(len2) rescale obbContact() applies to EVERY
// candidate axis, including face axes); FACE_COS_TOL=1e-6 leaves ~9 orders of margin over that noise floor
// while staying far tighter than any real angular separation between distinct SAT axes. Check A BEFORE B
// (never simultaneously) -- this mirrors obbContact()'s own tie behavior exactly: its consider() loop uses
// strict `overlap < bestDepth` and visits a.axes before b.axes, so on a bit-identical depth tie A's normal is
// never overwritten by B's; classifyAxis()'s A-first priority reproduces that, not an arbitrary convention.
// Only if NEITHER box has a face match does this fall through to the 9 edge-edge cross-product axes, skipping
// any with squared length < EPS (parallel edges, redundant with a face axis -- the SAME EPS=1e-12 guard
// obbOverlap.js's own consider() already uses for exactly this reason, so classifyAxis() can never match an
// axis obbContact() itself would have skipped).
//
// STEP 2a -- FACE-FACE (clipFaceFace()). The box whose axis won is the REFERENCE; its face is a rectangle with
// a known center/normal/side-extents. The INCIDENT face is picked from the OTHER box as whichever of its 3
// faces is most ANTI-parallel to the reference normal. The incident face's 4 corners are clipped against the
// reference face's 4 side half-planes via Sutherland-Hodgman (sequential clip against ±m, ±n bounds, keeping
// "inside" vertices and emitting the lerp intersection wherever in/out status flips across an edge -- can grow
// to up to 8 vertices for a twisted overlap, proven directly with a 35deg-about-the-shared-normal test case).
// Each surviving point's depth is the signed distance from the reference face plane along the reference
// normal; points with depth <= -SLOP are dropped (SLOP=1e-6, a roundoff allowance distinct from
// positionalCorrection()'s own opts.slop=0.01), and every kept depth is clamped to >= 0. Near-duplicate points
// (within 1e-9 world units -- a real, physically-plausible case: an incident corner landing exactly on a
// reference corner, where two different clip-plane passes can both re-emit the same physical point) are merged
// BEFORE reduction -- a gap all three independently-drafted design proposals for this file missed and the
// scratch derivation caught with a synthetic test before this was ever written here. More than 4 survivors are
// reduced to exactly 4 by the standard maximal-area selection (keep the deepest point unconditionally, then the
// point farthest from it, then the point maximizing triangle area with those two, then the point maximizing
// area on the OPPOSITE side of that first pair's line -- so the final quad genuinely spans the overlap rather
// than collapsing to one side of it).
//
// STEP 2b -- EDGE-EDGE (closestPointsEdgeEdge()). Given the specific winning axis PAIR (not just its
// direction), the actual witness edge on each box is selected by checking, for each of a box's other two
// local axes, which SIGN of that axis (relative to the contact normal, or its negation for B) points toward
// the other box -- this is exact by construction here, since the normal is defined as the cross product of
// exactly these two edge directions, so it is (to float precision) perpendicular to both. The closest points
// between the two resulting finite segments are found via Ericson's ClosestPtSegmentSegment (RTCD 5.1.9),
// reproduced with its own degenerate branches (near-zero-length segment, near-parallel denominator) rather
// than a bespoke simplification -- this is the textbook's own near-parallel handling, proven directly with a
// ~0.01deg near-parallel test case in this file's own gate. The manifold point is the MIDPOINT of the two
// closest points; its depth REUSES contact.depth verbatim rather than recomputing it from the closest-point
// separation (proven exact in the gate) -- one source of truth for "how deep", matching the depth this contact
// was actually detected at.
//
// STEP 3 -- FALLBACK. If face-face clipping ever produces zero surviving points (a genuine but rare float-
// roundoff sliver right at a face/edge boundary -- reproduced on demand in the gate by forcing the SLOP filter
// to reject everything, not merely asserted to be rare), this file falls back to rigidBody6dofCollision.mjs's
// own already-proven contactPoint() approximation for a single point, category:"fallback" -- obbManifold()
// NEVER returns an empty points array for a hit:true contact.
"use strict";
import { rotateByQuat } from "./voxelPose.js";

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub3 = (a, b) => add3(a, b, -1);
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const dist3 = (a, b) => norm3(sub3(a, b));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const FACE_COS_TOL = 1e-6;
const EPS = 1e-12;
const SLOP = 1e-6;
const DEDUPE_EPS = 1e-9;

/** Which of the 15 SAT axes contact.normal actually is: a face axis of A, a face axis of B, or one of the 9
 * edge-edge cross-product axes -- see this file's own header for the exact tie-break/tolerance reasoning. */
export function classifyAxis(a, b, normal) {
    const cosA = a.axes.map((ax) => dot3(normal, ax));
    const cosB = b.axes.map((ax) => dot3(normal, ax));
    let iA = 0; for (let i = 1; i < 3; i++) if (Math.abs(cosA[i]) > Math.abs(cosA[iA])) iA = i;
    let iB = 0; for (let i = 1; i < 3; i++) if (Math.abs(cosB[i]) > Math.abs(cosB[iB])) iB = i;
    if (Math.abs(cosA[iA]) >= 1 - FACE_COS_TOL) return { kind: "faceA", axis: iA, sign: cosA[iA] >= 0 ? 1 : -1 };
    if (Math.abs(cosB[iB]) >= 1 - FACE_COS_TOL) return { kind: "faceB", axis: iB, sign: cosB[iB] >= 0 ? 1 : -1 };
    let best = null, bestAbs = -1;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const c = cross3(a.axes[i], b.axes[j]);
        const len2 = dot3(c, c);
        if (len2 < EPS) continue;
        const n = scale3(c, 1 / Math.sqrt(len2));
        const val = Math.abs(dot3(normal, n));
        if (val > bestAbs) { bestAbs = val; best = { i, j }; }
    }
    if (!best) return null;
    return { kind: "edge", axisA: best.i, axisB: best.j };
}

function otherTwo(axis) { return axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]; }

function clipAgainstPlane(poly, planeAxis, bound, keepLessEqual, refFaceCenter) {
    const out = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const curr = poly[i], next = poly[(i + 1) % n];
        const uCurr = dot3(sub3(curr, refFaceCenter), planeAxis);
        const uNext = dot3(sub3(next, refFaceCenter), planeAxis);
        const inCurr = keepLessEqual ? uCurr <= bound : uCurr >= bound;
        const inNext = keepLessEqual ? uNext <= bound : uNext >= bound;
        if (inCurr) out.push(curr);
        if (inCurr !== inNext) out.push(add3(curr, sub3(next, curr), (bound - uCurr) / (uNext - uCurr)));
    }
    return out;
}

function dedupePoints(pts) {
    const out = [];
    for (const p of pts) if (!out.some((q) => dist3(p.point, q.point) < DEDUPE_EPS)) out.push(p);
    return out;
}

/** Reduce >4 clipped points to exactly 4 via the standard maximal-area selection (see this file's own header),
 * unwrapping .point on every raw-vector operation -- passing the {point,normal,depth} wrapper objects directly
 * into a vector helper silently produces NaN throughout (wrapper[0] is undefined), the exact bug a first draft
 * of this function had, caught in the standalone scratch derivation before this was ever written here. */
function reduceToFour(pts, refFaceCenter, mAxis, nAxis) {
    if (pts.length <= 4) return pts;
    const proj = (p) => [dot3(sub3(p.point, refFaceCenter), mAxis), dot3(sub3(p.point, refFaceCenter), nAxis)];
    let p0 = pts[0]; for (const p of pts) if (p.depth > p0.depth) p0 = p;
    let p1 = pts[0], bestD = -1;
    for (const p of pts) { const d = dist3(p.point, p0.point); if (d > bestD) { bestD = d; p1 = p; } }
    const cross2 = (o, a, b) => { const pa = proj(a), pb = proj(b), po = proj(o); return (pa[0] - po[0]) * (pb[1] - po[1]) - (pa[1] - po[1]) * (pb[0] - po[0]); };
    let p2 = null, bestArea = -1, p2Side = 0;
    for (const p of pts) {
        if (p === p0 || p === p1) continue;
        const area = Math.abs(cross2(p0, p1, p));
        if (area > bestArea) { bestArea = area; p2 = p; p2Side = Math.sign(cross2(p0, p1, p)); }
    }
    let p3 = null, bestScore = -1;
    for (const p of pts) {
        if (p === p0 || p === p1 || p === p2) continue;
        const side = Math.sign(cross2(p0, p1, p));
        const area = Math.abs(cross2(p0, p1, p));
        const score = (side !== 0 && side !== p2Side ? 1e9 : 0) + area;
        if (score > bestScore) { bestScore = score; p3 = p; }
    }
    return [p0, p1, p2, p3].filter(Boolean);
}

function clipFaceFace(REF, OTH, axis, sign) {
    const refN = scale3(REF.axes[axis], sign);
    const refFaceCenter = add3(REF.center, scale3(REF.axes[axis], sign * REF.half[axis]));
    const [m, n] = otherTwo(axis);
    const mAxis = REF.axes[m], nAxis = REF.axes[n];

    const d = OTH.axes.map((ax) => dot3(refN, ax));
    let incAxis = 0; for (let k = 1; k < 3; k++) if (Math.abs(d[k]) > Math.abs(d[incAxis])) incAxis = k;
    const incSign = d[incAxis] >= 0 ? -1 : 1;
    const incFaceCenter = add3(OTH.center, scale3(OTH.axes[incAxis], incSign * OTH.half[incAxis]));
    const [p, q] = otherTwo(incAxis);
    const pAxis = OTH.axes[p], qAxis = OTH.axes[q];
    const corner = (sp, sq) => add3(add3(incFaceCenter, pAxis, sp * OTH.half[p]), qAxis, sq * OTH.half[q]);
    let poly = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];

    poly = clipAgainstPlane(poly, mAxis, REF.half[m], true, refFaceCenter);
    poly = clipAgainstPlane(poly, mAxis, -REF.half[m], false, refFaceCenter);
    poly = clipAgainstPlane(poly, nAxis, REF.half[n], true, refFaceCenter);
    poly = clipAgainstPlane(poly, nAxis, -REF.half[n], false, refFaceCenter);

    let withDepth = poly.map((P) => ({ point: P, normal: refN, depth: dot3(sub3(refFaceCenter, P), refN) }));
    withDepth = withDepth.filter((pt) => pt.depth > -SLOP).map((pt) => ({ ...pt, depth: Math.max(pt.depth, 0) }));
    withDepth = dedupePoints(withDepth);
    return reduceToFour(withDepth, refFaceCenter, mAxis, nAxis);
}

// Ericson RTCD 5.1.9, reproduced with its own degenerate branches (near-zero-length segment, near-parallel
// denominator) rather than a bespoke simplification.
function closestPtSegmentSegment(p1, q1, p2, q2) {
    const d1 = sub3(q1, p1), d2 = sub3(q2, p2), r = sub3(p1, p2);
    const a = dot3(d1, d1), e = dot3(d2, d2), f = dot3(d2, r);
    let s, t;
    if (a <= EPS && e <= EPS) { s = 0; t = 0; }
    else if (a <= EPS) { s = 0; t = clamp01(f / e); }
    else {
        const c = dot3(d1, r);
        if (e <= EPS) { t = 0; s = clamp01(-c / a); }
        else {
            const b = dot3(d1, d2);
            const denom = a * e - b * b;
            s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
            t = (b * s + f) / e;
            if (t < 0) { t = 0; s = clamp01(-c / a); }
            else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
        }
    }
    return { c1: add3(p1, d1, s), c2: add3(p2, d2, t) };
}

function closestPointsEdgeEdge(a, b, normal, axisA, axisB) {
    const [ma, na] = otherTwo(axisA);
    const sAm = dot3(normal, a.axes[ma]) >= 0 ? 1 : -1, sAn = dot3(normal, a.axes[na]) >= 0 ? 1 : -1;
    const edgeACenter = add3(add3(a.center, a.axes[ma], sAm * a.half[ma]), a.axes[na], sAn * a.half[na]);
    const p1 = sub3(edgeACenter, scale3(a.axes[axisA], a.half[axisA])), q1 = add3(edgeACenter, scale3(a.axes[axisA], a.half[axisA]));

    const toward = scale3(normal, -1);
    const [mb, nb] = otherTwo(axisB);
    const sBm = dot3(toward, b.axes[mb]) >= 0 ? 1 : -1, sBn = dot3(toward, b.axes[nb]) >= 0 ? 1 : -1;
    const edgeBCenter = add3(add3(b.center, b.axes[mb], sBm * b.half[mb]), b.axes[nb], sBn * b.half[nb]);
    const p2 = sub3(edgeBCenter, scale3(b.axes[axisB], b.half[axisB])), q2 = add3(edgeBCenter, scale3(b.axes[axisB], b.half[axisB]));

    const { c1, c2 } = closestPtSegmentSegment(p1, q1, p2, q2);
    return scale3(add3(c1, c2), 0.5);
}

/** contactPoint(): reproduced verbatim from physics/mechanics/rigidBody6dofCollision.mjs's own approximation
 * (the midpoint of each box's own support point pushed along the normal by its projected half-width) -- this
 * file's own fallback for the rare empty-clip case reuses the SAME already-proven formula rather than a new
 * one. Not exported: rigidBody6dofCollision.mjs's own contactPoint() remains the canonical export other code
 * should import; this is a private, physics-mechanics-free copy so obbManifold.js never imports from mechanics/. */
function fallbackContactPoint(obbA, obbB, normal) {
    const projectedHalfWidth = (obb, dir) => Math.abs(dot3(dir, obb.axes[0])) * obb.half[0] + Math.abs(dot3(dir, obb.axes[1])) * obb.half[1] + Math.abs(dot3(dir, obb.axes[2])) * obb.half[2];
    const pA = add3(obbA.center, normal, projectedHalfWidth(obbA, normal));
    const pB = add3(obbB.center, normal, -projectedHalfWidth(obbB, normal));
    return scale3(add3(pA, pB), 0.5);
}

/**
 * The full contact manifold for two touching OBBs. `contact` = obbContact(a,b)'s already-computed {hit:true,
 * normal, depth} -- caller MUST check contact.hit first (same precondition checkContact()/obbContact() callers
 * already enforce today). Returns {category, points} -- category is "faceA"|"faceB"|"edge"|"fallback";
 * points is an Array<{point:[x,y,z], normal:[x,y,z], depth:number}>, length ALWAYS in [1,4], NEVER empty.
 */
export function obbManifold(a, b, contact) {
    const cls = classifyAxis(a, b, contact.normal);
    const fallback = () => ({ category: "fallback", points: [{ point: fallbackContactPoint(a, b, contact.normal), normal: contact.normal, depth: Math.max(contact.depth, 0) }] });
    if (!cls) return fallback();
    if (cls.kind === "faceA" || cls.kind === "faceB") {
        const REF = cls.kind === "faceA" ? a : b, OTH = cls.kind === "faceA" ? b : a;
        const points = clipFaceFace(REF, OTH, cls.axis, cls.sign);
        if (points.length === 0) return fallback();
        return { category: cls.kind, points };
    }
    const point = closestPointsEdgeEdge(a, b, contact.normal, cls.axisA, cls.axisB);
    return { category: "edge", points: [{ point, normal: contact.normal, depth: Math.max(contact.depth, 0) }] };
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const obbFromPosed = (box) => {
        const q = box.quat || [0, 0, 0, 1];
        return { center: box.center, half: box.half, axes: [rotateByQuat(q, [1, 0, 0]), rotateByQuat(q, [0, 1, 0]), rotateByQuat(q, [0, 0, 1])] };
    };
    const a = obbFromPosed({ center: [0, 0, 0], half: [2, 2, 1], quat: [0, 0, 0, 1] });
    // 35deg twist about the shared contact-normal axis -- a genuinely 4-point-reduced-from-8-candidate case,
    // more interesting to demo than a trivial flush-aligned one.
    const half = 35 * Math.PI / 360;
    const b = obbFromPosed({ center: [3.5, 0, 0], half: [2, 2, 1], quat: [Math.sin(half), 0, 0, Math.cos(half)] });
    const contact = { hit: true, normal: [1, 0, 0], depth: (a.center[0] + a.half[0]) - (b.center[0] - b.half[0]) };
    const m = obbManifold(a, b, contact);
    return [
        "[obbManifold] a full box-box contact manifold (up to 4 points) via reference/incident-face Sutherland-",
        "              Hodgman clipping or edge-edge closest-point math, both proven in this file's own gate.",
        `  category: ${m.category}  points: ${m.points.length}`,
        ...m.points.map((p, i) => `    #${i}  point=${p.point.map((v) => v.toFixed(3))}  depth=${p.depth.toFixed(4)}`),
    ];
}
// GUARDED (this tree's established idiom): this module can be loaded by a PAGE as well as run as a CLI, and
// `process` at module top level is a ReferenceError in a browser, not a caught failure -- an EVALUATION
// failure that would take the whole page down with it. The node:url import itself must be INSIDE the guard.
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        for (const l of reportLines()) console.log(l);
        process.exit(0);
    }
}
