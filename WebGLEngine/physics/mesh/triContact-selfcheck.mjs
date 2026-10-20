// WebGLEngine/physics/mesh/triContact-selfcheck.mjs
//
// Run: node physics/mesh/triContact-selfcheck.mjs
//
// ROUND 12 OF THE BVH-CSG ARC: the gate for physics/mesh/triContact.mjs (the contacts triTriIntersect refuses) and
// for meshBoolean.mjs's nearSide() (a face within 1e-8 of the other surface, sided locally). What they can be wrong
// about, and the section that would see it:
//   1. CONTACTS BY HAND -- coplanar same-facing and opposite-facing, the 5.55e-17 flush gap, a hinge, a touch at a
//      point, parallel planes apart: each answer derived on paper first.
//   2. THE SEAM IS BUILT ONCE -- contactPair(P, Q) and contactPair(Q, P) return the same kind, orientation and
//      endpoints BIT FOR BIT, over every pair triTriIntersect refuses in round 12's fixture families.
//      meshBoolean-selfcheck's 1e-6 census cannot see a 1e-16 asymmetry; this can (the first sabotage battery
//      removed the canonical ordering with 0 red in every other gate).
//   3. closestOnTriangle AGAINST BRUTE FORCE, and angleAt.
//   4. nearSide AT A KNIFE EDGE -- points just outside a 10-degree wedge's tip, where the nearest triangle's plane
//      alone says INSIDE for some of them; the angle-weighted pseudo-normal must say outside for all (the first
//      sabotage battery replaced the pseudo-normal by the nearest plane with 0 red in the other gates).
"use strict";

import { contactPair, closestOnTriangle, angleAt, CONTACT_EPS } from "./triContact.mjs";
import { triTriIntersect } from "./triTriIntersect.mjs";
import { nearSide } from "./meshBoolean.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import * as M from "./meshCSG.mjs";

let fails = 0;
const ok = (name, cond, info = "") => { if (!cond) fails++; console.log((cond ? "  PASS  " : "  FAIL  ") + name + (info ? "   " + info : "")); };
const rd = (T, i) => [[T[i * 9], T[i * 9 + 1], T[i * 9 + 2]], [T[i * 9 + 3], T[i * 9 + 4], T[i * 9 + 5]], [T[i * 9 + 6], T[i * 9 + 7], T[i * 9 + 8]]];
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

console.log("\n1. *** CONTACTS BY HAND ***");
{
    const T = [[0, 0, 0], [2, 0, 0], [0, 2, 0]];                       // z = 0, normal +z
    const up = [[0.5, 0.5, 0], [1.5, 0.5, 0], [0.5, 1.5, 0]];          // same plane, same winding
    const down = [[0.5, 0.5, 0], [0.5, 1.5, 0], [1.5, 0.5, 0]];        // same plane, reversed
    const a = contactPair(T, up), b = contactPair(T, down);
    ok("coplanar, same winding -> coplanar, orient +1; reversed -> orient -1", a.kind === "coplanar" && a.orient === 1 && b.kind === "coplanar" && b.orient === -1,
        JSON.stringify(a) + " " + JSON.stringify(b));
    const flush = [[0.5, 0.5, 0.8 - 0.5], [0.5, 1.5, 0.8 - 0.5], [1.5, 0.5, 0.8 - 0.5]], T3 = T.map((v) => [v[0], v[1], 0.3]);
    const f = contactPair(T3, flush);
    ok("the 5.55e-17 flush gap (0.8 - 0.5 against 0.3) is coplanar, not a miss", f.kind === "coplanar" && f.orient === -1 && 0.8 - 0.5 !== 0.3,
        "0.8-0.5 = " + (0.8 - 0.5) + ", kind " + f.kind + ", orient " + f.orient);
    // a hinge: Q stands on T's plane along its own edge y = 0.5, x in [0.5, 1.5], leaning up -- a touching edge
    const hinge = [[0.5, 0.5, 0], [1.5, 0.5, 0], [1, 0.5, 1]];
    const h = contactPair(T, hinge);
    const ends = h.kind === "segment" ? [h.p0, h.p1].sort((p, q) => p[0] - q[0]) : [];
    ok("a triangle standing on T along one edge -> that edge, as an on-plane segment", h.kind === "segment" && h.onPlane &&
        same(ends[0], [0.5, 0.5, 0]) && same(ends[1], [1.5, 0.5, 0]), JSON.stringify(h));
    // Q crosses T's plane with one vertex exactly on it: the segment from that vertex to the opposite edge's crossing
    const cross = [[1, 0.5, 0], [0.5, 1, 1], [0.5, 1, -1]];
    const c = contactPair(T, cross);
    const ce = c.kind === "segment" ? [c.p0, c.p1].sort((p, q) => q[0] - p[0]) : [];
    ok("a vertex exactly on T's plane, the opposite edge crossing it -> the segment (1,0.5,0)-(0.5,1,0), not onPlane", c.kind === "segment" && !c.onPlane &&
        same(ce[0], [1, 0.5, 0]) && same(ce[1], [0.5, 1, 0]), JSON.stringify(c));
    const point = [[1, 0.5, 0], [1.5, 1, 1], [0.5, 1, 1]];            // touches at one vertex only
    ok("a triangle touching T at one vertex -> none", contactPair(T, point).kind === "none", JSON.stringify(contactPair(T, point)));
    const apart = T.map((v) => [v[0], v[1], 2 * CONTACT_EPS]);
    ok("parallel planes 2 x CONTACT_EPS apart -> none (" + CONTACT_EPS + " is the contact tolerance)", contactPair(T, apart).kind === "none");
    const within = T.map((v) => [v[0], v[1], 0.5 * CONTACT_EPS]);
    ok("...and 0.5 x CONTACT_EPS apart -> coplanar", contactPair(T, within).kind === "coplanar");
}

console.log("\n2. *** THE SEAM IS BUILT ONCE: contactPair IS SYMMETRIC, BIT FOR BIT ***");
{
    // harvest every pair triTriIntersect refuses (coplanar/degenerate) in round 12's families: flush boxes on a 1/4
    // grid (as built, rotated 0.7 rad about z, shifted 0.1), a face tilted by s about an edge, a blob and its own copy
    // rotated by theta
    const pairs = [];
    const harvest = (PA, PB) => {
        const a = M.toTriangleBuffer(PA), b = M.toTriangleBuffer(PB);
        for (const [i, j] of pairOverlap(new MeshBVH(a), new MeshBVH(b), 1e-8)) {
            const s = triTriIntersect(a, i, b, j).status;
            if (s === "coplanar" || s === "degenerate") pairs.push([rd(a, i), rd(b, j)]);
        }
    };
    let st = 4242 >>> 0; const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    const q = () => Math.round((rnd() * 2 - 1) * 4) / 4, hq = () => (1 + Math.floor(rnd() * 4)) / 4;
    const rz = (P, th) => P.map((p) => { const vs = p.vs.map((v) => [v[0] * Math.cos(th) - v[1] * Math.sin(th), v[0] * Math.sin(th) + v[1] * Math.cos(th), v[2]]); return { vs, pl: M.planeOf(vs) }; });
    for (let k = 0; k < 60; k++) {
        const c1 = [q(), q(), q()], h1 = [hq(), hq(), hq()], c2 = [q(), q(), q()], h2 = [hq(), hq(), hq()];
        harvest(M.boxPolys(c1, h1), M.boxPolys(c2, h2));
        harvest(rz(M.boxPolys(c1, h1), 0.7), rz(M.boxPolys(c2, h2), 0.7));
        harvest(M.boxPolys(c1.map((x) => x + 0.1), h1), M.boxPolys(c2.map((x) => x + 0.1), h2));
    }
    for (const s of [1e-10, 1e-9, 3e-9, 1e-8]) {
        const P = []; for (let i = 0; i < 8; i++) P.push([i & 1 ? 1 : 0, i & 2 ? 1 : 0, i & 4 ? 2 : 1 - s * (i & 1 ? 1 : 0)]);
        const B = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]].map((ix) => { const vs = ix.map((i) => P[i].slice()); return { vs, pl: M.planeOf(vs) }; });
        harvest(M.boxPolys([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]), B);
    }
    const blob = M.jaggedBlob([0.1, 0.05, 0], 1, 8, 101);
    for (const th of [1e-10, 1e-9, 1e-8]) harvest(blob, rz(blob, th));
    let asym = 0, segs = 0, cops = 0;
    const key = (c) => c.kind + (c.kind === "coplanar" ? c.orient : "") + (c.kind === "segment" ? [c.p0, c.p1].map((p) => p.join(",")).sort().join("|") + c.onPlane : "");
    for (const [P, Q] of pairs) {
        const x = contactPair(P, Q), y = contactPair(Q, P);
        if (key(x) !== key(y)) asym++;
        if (x.kind === "segment") segs++;
        if (x.kind === "coplanar") cops++;
    }
    ok("the families give pairs of both kinds to test (a vacuous symmetry check would prove nothing)", segs > 100 && cops > 100,
        pairs.length + " refused pairs: " + segs + " segments, " + cops + " coplanar");
    ok("!! contactPair(P, Q) and contactPair(Q, P): same kind, orientation and endpoints, bit for bit, on every one", asym === 0, asym + " asymmetric of " + pairs.length);
}

console.log("\n3. *** closestOnTriangle AGAINST BRUTE FORCE; angleAt ***");
{
    let st = 99 >>> 0; const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296 * 2 - 1; };
    let worst = 0, regionBad = 0;
    for (let k = 0; k < 300; k++) {
        const a = [rnd(), rnd(), rnd()], b = [rnd(), rnd(), rnd()], c = [rnd(), rnd(), rnd()], p = [2 * rnd(), 2 * rnd(), 2 * rnd()];
        const r = closestOnTriangle(p, a, b, c);
        // brute force over a 200 x 200 barycentric grid, then refined near the best
        let best = Infinity, bu = 0, bv = 0;
        const N = 200;
        for (let i = 0; i <= N; i++) for (let j = 0; i + j <= N; j++) {
            const u = i / N, v = j / N, q = [a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]), a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]), a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2])];
            const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
            if (d < best) { best = d; bu = u; bv = v; }
        }
        // the grid's answer is an upper bound within one cell of the true one
        if (r.d2 > best + 1e-12) worst = Math.max(worst, r.d2 - best);
        const onEdge = bu === 0 || bv === 0 || Math.abs(bu + bv - 1) < 1e-9;
        if (r.region === "face" && onEdge && best - r.d2 > 1e-4) regionBad++;
    }
    ok("closestOnTriangle is never farther than a 200x200 brute-force grid finds (300 random triangles and points)", worst === 0, "worst excess " + worst);
    ok("...and calls a point's nearest point interior only when the grid finds no nearer boundary point", regionBad === 0, regionBad + " disagreements");
    const q = [0, 0, 0];
    ok("angleAt: a right-angle corner is pi/2, an edge interior pi", Math.abs(angleAt(q, [0, 0, 0], [1, 0, 0], [0, 1, 0], 1e-12) - Math.PI / 2) < 1e-15 &&
        angleAt([0.5, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0], 1e-12) === Math.PI);
}

console.log("\n4. *** nearSide AT A KNIFE EDGE: THE PSEUDO-NORMAL, NOT THE NEAREST PLANE ***");
{
    // a 10-degree wedge along z: apex edge on the z axis, opening toward -x, closed prism z in [-1, 1]
    const t = Math.tan(5 * Math.PI / 180), P = [[0, 0], [-1, t], [-1, -t]];
    const top = P.map(([x, y]) => [x, y, 1]), bot = P.map(([x, y]) => [x, y, -1]);
    const polys = [
        { vs: [top[0], top[1], top[2]] }, { vs: [bot[0], bot[2], bot[1]] },
        { vs: [bot[0], bot[1], top[1], top[0]] }, { vs: [bot[1], bot[2], top[2], top[1]] }, { vs: [bot[2], bot[0], top[0], top[2]] },
    ].map((p) => ({ vs: p.vs, pl: M.planeOf(p.vs) }));
    const buf = M.toTriangleBuffer(polys), cands = [...Array(buf.length / 9).keys()];
    ok("sanity: the wedge is a closed solid of the right volume", Math.abs(M.volume(polys) - 2 * t) < 1e-12 && M.watertight(polys).ok, "volume " + M.volume(polys));
    // points 1e-9 from the apex, around the outside, in its Voronoi region (between the two faces' normals)
    let wrong = 0, planeWrong = 0, n = 0;
    for (let deg = -84; deg <= 84; deg += 4) {
        const a = deg * Math.PI / 180, p = [1e-9 * Math.cos(a), 1e-9 * Math.sin(a), 0.1];
        const r = nearSide(p, buf, cands);
        n++;
        if (!r || r.edge || r.inside) wrong++;
        // what the nearest triangle's plane alone says (the first one found at the minimum distance, as a naive test would)
        let best = null;
        for (const tb of cands) { const o = tb * 9; const c = closestOnTriangle(p, [buf[o], buf[o + 1], buf[o + 2]], [buf[o + 3], buf[o + 4], buf[o + 5]], [buf[o + 6], buf[o + 7], buf[o + 8]]); if (!best || c.d2 < best.d2) best = c; }
        if (best.planeDist < 0) planeWrong++;
    }
    ok("the nearest plane alone calls some of these outside points INSIDE (a vacuous check would prove nothing)", planeWrong > 0, planeWrong + " of " + n);
    ok("!! nearSide calls every one of them outside", wrong === 0, wrong + " wrong of " + n);
    // and inside, just behind the tip
    let inWrong = 0;
    for (const y of [-1e-10, 0, 1e-10]) { const r = nearSide([-5e-9, y * 0.1, 0.1], buf, cands); if (!r || r.edge || !r.inside) inWrong++; }
    ok("...and points 5e-9 inside the tip inside", inWrong === 0, inWrong + " wrong of 3");
}

console.log(`\ntriContact-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails ? 1 : 0);
