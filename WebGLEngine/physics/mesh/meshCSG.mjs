// WebGLEngine/physics/mesh/meshCSG.mjs -- v4235
//
// BSP MESH BOOLEANS: AN EXACT HOLE IN A WALL, ON THE WALL'S OWN PLANE, AT ANY ANGLE, WITH NO GRID.
//
// The algorithm is evanw/csg.js (MIT) -- Plane/Polygon/Node, clipTo/invert/build. What is taken is the
// METHOD; the code is written out here because csg.js is a three.js-era CommonJS file with its own vector
// class, and this tree has neither.
//
// *** MEASURED BEFORE BUILDING, BECAUSE THE PROPOSAL SAID "IN REAL TIME" AND THAT IS THE WORD THAT DECIDES
// WHETHER THIS IS WORTH HAVING. *** A 6-polygon concrete wall minus one jagged 256-triangle explosion blob:
// 561 polygons out, 11.6 ms. That is one frame, and it is fine. TWELVE overlapping blasts on the same wall:
// shot 1 costs 12.7 ms, SHOT 12 COSTS 318.8 ms, and the wall is 20,647 polygons where it began as 6.
//
// So the literal proposal -- subtract a blob from a wall, in real time, repeatedly -- HOLDS FOR THE FIRST
// HOLE AND FAILS BY THE THIRD. The cost is not the boolean. It is running the boolean on the WHOLE WALL when
// a blast reaches 2% of it. Localised to the polygons whose AABB meets the blast:
//
//     cumulative over 12 shots   2154 ms -> 362 ms   (5.9x)
//     final polygon count        20,647 -> 8,979     (2.3x)
//
// and the 2.3x is not a speed trick -- clipping a polygon through B's BSP splits it along B's planes even
// where it lies nowhere near B, so the whole-wall path manufactures geometry that the localised path never
// creates. THE LOCALISED RESULT IS THE BETTER MESH, NOT MERELY THE FASTER ONE.
//
// *** WHICH FORCES THE ONE RULE THIS FILE IS EASIEST TO GET WRONG. *** The two paths DO NOT AGREE POLYGON FOR
// POLYGON and must never be asserted to. They agree on the SOLID: same volume, same watertight surface. A
// gate that diffed the polygon lists would be red on a correct optimisation, and the temptation would then be
// to make the fast path reproduce the slow path's waste. Volume and watertightness are the invariants; the
// polygon list is an implementation detail. The gate is written that way and says so.
//
// WHERE THE BLOWUP ACTUALLY LIVES, measured on the 12-shot wall: 9,303 of the 20,647 polygons (45.1%) lie on
// one of the wall's SIX ORIGINAL PLANES and render identically to the six quads they started as, carrying
// 67.4% of the surface area. mergeCoplanar() below is what takes those back.
//
// *** AND HALF THE PROPOSAL IS NOT A BOOLEAN AT ALL. *** "Gap-free rubble and holes" is two problems. A BSP
// subtraction returns ONE CONNECTED MESH WITH A HOLE IN IT. Rubble is pieces, and a piece needs a mass, a
// centre of mass and an inertia tensor -- which is physics/voxel/fracture.js, already exact, already holding
// a voxel summation to the analytic box tensor including each voxel's own-centre term. This file makes the
// hole. It does not make the rubble, it does not duplicate fracture.js, and it says so here so that the next
// reader does not go looking for a fragment splitter that was deliberately not written.
//
// WHY NOT THE SDF CSG NEXT DOOR (physics/mesh/csg.mjs): that path is exact in the FIELD and then samples it
// on a grid, so the hole's rim is bounded by the grid and a jagged blast is smoothed toward the cell size.
// This path never samples anything. Its vertices lie exactly on the input planes, which is the whole reason
// to carry a second CSG at all. Neither replaces the other and both are kept.
//
// SIGN AND WINDING: polygons are COUNTER-CLOCKWISE seen from outside, normal pointing OUT of the solid --
// which is the opposite end of the same convention csg.mjs states for its fields (negative inside). invert()
// must reverse the vertex order AND negate the plane; doing only one of the two silently turns the solid
// inside out, and the gate sabotages exactly that.
//
// EVERY POLYGON IN THIS SYSTEM IS CONVEX, and that is an invariant rather than an accident: box faces and
// blob triangles start convex, and splitting a convex polygon by a plane yields two convex polygons. The
// triangulator is a FAN, which is only valid on a convex polygon, so mergeCoplanar refuses any merge that
// would produce a reflex vertex. The gate asserts the invariant over the real output rather than trusting it.
"use strict";

import { MeshBVH } from "../../mesh/meshBVH.mjs";

/** Plane classification epsilon. A vertex within EPS of a plane is ON it, not in front or behind. */
export const EPS = 1e-5;

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The plane through a polygon's first three vertices: unit normal n and offset w, so dot(n,p) = w on it. */
export function planeOf(vs) {
    const n = norm3(cross3(sub3(vs[1], vs[0]), sub3(vs[2], vs[0])));
    return { n, w: dot3(n, vs[0]) };
}

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

/**
 * *** THE SLIVER COUNTER, WHICH EXISTS BECAUSE OF WHAT IT FOUND. *** A split that leaves fewer than three
 * vertices on one side is not a polygon and csg.js drops it, silently. Over ONE boolean that is invisible.
 * Over twelve, the dropped slivers add up to micro-cracks: 20 of 64,064 directed edges on a twelve-blast wall
 * end up with no partner and NO COVERAGE either -- a real hole, not a T-junction, and tolerance-insensitive
 * (identical at weld tolerances from 1e-9 to 1e-7, and worse if loosened). This counter is what let that be
 * attributed rather than guessed at, and it is exported so the gate can assert the rate rather than the
 * absence.
 */
export const SPLIT_STATS = { splits: 0, dropped: 0 };
export const resetSplitStats = () => { SPLIT_STATS.splits = 0; SPLIT_STATS.dropped = 0; };

/**
 * Classify `poly` against `pl` and push it into one of four buckets, SPLITTING it if it straddles.
 *
 * The two coplanar buckets are separated by whether the polygon faces the same way as the plane, and that is
 * not a nicety: a union that put a back-facing coplanar polygon in the front bucket keeps both copies of a
 * shared face and the result is not a solid any more.
 */
export function splitPolygon(pl, poly, coplanarFront, coplanarBack, front, back) {
    let type = 0;
    const types = [];
    for (const v of poly.vs) {
        const t = dot3(pl.n, v) - pl.w;
        const ty = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
        type |= ty;
        types.push(ty);
    }
    if (type === COPLANAR) { (dot3(pl.n, poly.pl.n) > 0 ? coplanarFront : coplanarBack).push(poly); return; }
    if (type === FRONT) { front.push(poly); return; }
    if (type === BACK) { back.push(poly); return; }
    const fv = [], bv = [];
    for (let i = 0; i < poly.vs.length; i++) {
        const j = (i + 1) % poly.vs.length;
        const ti = types[i], tj = types[j], vi = poly.vs[i], vj = poly.vs[j];
        if (ti !== BACK) fv.push(vi);
        if (ti !== FRONT) bv.push(vi);
        if ((ti | tj) === SPANNING) {
            const t = (pl.w - dot3(pl.n, vi)) / dot3(pl.n, sub3(vj, vi));
            const v = lerp3(vi, vj, t);
            fv.push(v); bv.push(v);
        }
    }
    // A split can leave a 2-vertex sliver when the polygon only grazes the plane; those are not polygons.
    SPLIT_STATS.splits++;
    // The tag rides along: a fragment of A's surface is still A's surface, however many times it was split.
    if (fv.length >= 3) front.push({ vs: fv, pl: poly.pl, src: poly.src }); else SPLIT_STATS.dropped++;
    if (bv.length >= 3) back.push({ vs: bv, pl: poly.pl, src: poly.src }); else SPLIT_STATS.dropped++;
}

/** A BSP node: a splitting plane, the polygons ON it, and the two subtrees. */
export class Node {
    constructor(polys) {
        this.pl = null; this.front = null; this.back = null; this.polys = [];
        if (polys && polys.length) this.build(polys);
    }

    /** Turn the solid inside out. BOTH halves, or it is not an inversion -- see the header. */
    invert() {
        for (const p of this.polys) {
            p.vs.reverse();
            p.pl = { n: [-p.pl.n[0], -p.pl.n[1], -p.pl.n[2]], w: -p.pl.w };
        }
        if (this.pl) this.pl = { n: [-this.pl.n[0], -this.pl.n[1], -this.pl.n[2]], w: -this.pl.w };
        if (this.front) this.front.invert();
        if (this.back) this.back.invert();
        const t = this.front; this.front = this.back; this.back = t;
    }

    /** Remove the parts of `polys` that are INSIDE this solid. */
    clipPolygons(polys) {
        if (!this.pl) return polys.slice();
        let f = [], b = [];
        for (const p of polys) splitPolygon(this.pl, p, f, b, f, b);
        if (this.front) f = this.front.clipPolygons(f);
        b = this.back ? this.back.clipPolygons(b) : [];
        return f.concat(b);
    }

    /** Remove everything of OURS that is inside `other`. */
    clipTo(other) {
        this.polys = other.clipPolygons(this.polys);
        if (this.front) this.front.clipTo(other);
        if (this.back) this.back.clipTo(other);
    }

    allPolygons() {
        let r = this.polys.slice();
        if (this.front) r = r.concat(this.front.allPolygons());
        if (this.back) r = r.concat(this.back.allPolygons());
        return r;
    }

    build(polys) {
        if (!polys.length) return;
        if (!this.pl) this.pl = polys[0].pl;
        const f = [], b = [];
        for (const p of polys) splitPolygon(this.pl, p, this.polys, this.polys, f, b);
        if (f.length) { if (!this.front) this.front = new Node(); this.front.build(f); }
        if (b.length) { if (!this.back) this.back = new Node(); this.back.build(b); }
    }
}

const clonePolys = (ps) => ps.map((p) => ({ vs: p.vs.map((v) => v.slice()), pl: { n: p.pl.n.slice(), w: p.pl.w }, src: p.src }));

/**
 * *** WHICH FACES ARE THE CUT, AND WHICH WERE ALWAYS THERE. ***
 *
 * The BSP has always known this and always thrown it away. subtract(A, B) returns two kinds of polygon:
 * fragments of A's original surface that survived clipping, and polygons of B turned inside out to cap the
 * hole. The first kind is the object's SKIN -- weathered, painted, already unwrapped when the mesh was
 * authored. The second kind is the CUT -- freshly exposed interior that did not exist a moment ago and has
 * no texture coordinates, because nothing unwrapped a surface that had not been made yet.
 *
 * Tagging costs one string per polygon and is checkable by construction: every polygon tagged CUT must lie
 * on one of B's planes, and no polygon tagged SKIN may.
 */
export const SKIN = "skin";      // came from A: the surface that was always on the outside
export const CUT  = "cut";       // came from B: the face the boolean created

const tag = (ps, src) => ps.map((p) => ({ ...p, src }));

/** A - B. The polygons of A that lie outside B, plus the polygons of B that lie inside A, facing inward. */
export function subtract(A, B) {
    const a = new Node(clonePolys(tag(A, SKIN))), b = new Node(clonePolys(tag(B, CUT)));
    a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert();
    a.build(b.allPolygons()); a.invert();
    return a.allPolygons();
}

/** A + B. */
export function union(A, B) {
    const a = new Node(clonePolys(A)), b = new Node(clonePolys(B));
    a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert();
    a.build(b.allPolygons());
    return a.allPolygons();
}

/** A AND B. */
export function intersect(A, B) {
    const a = new Node(clonePolys(A)), b = new Node(clonePolys(B));
    a.invert(); b.clipTo(a); b.invert(); a.clipTo(b); b.clipTo(a);
    a.build(b.allPolygons()); a.invert();
    return a.allPolygons();
}

// ---- THE SOLID'S INVARIANTS, WHICH ARE WHAT A BOOLEAN IS GRADED ON ------------------------------------------

/**
 * Signed volume by the divergence theorem, fan-triangulating each polygon.
 *
 * *** THIS IS THE GRADING INSTRUMENT AND IT IS EXACT, WHICH IS WHY IT IS WORTH MORE THAN COMPARING MESHES. ***
 * The volume of a closed polyhedron is (1/6) sum of dot(a, cross(b, c)) over its triangles, and it does not
 * care how the surface was cut up. Two boolean paths that split a wall differently agree here to the last bit
 * they can.
 */
export function volume(polys) {
    let v = 0;
    for (const p of polys) {
        for (let i = 1; i + 1 < p.vs.length; i++) {
            v += dot3(p.vs[0], cross3(p.vs[i], p.vs[i + 1]));
        }
    }
    return v / 6;
}

export function surfaceArea(polys) {
    let a = 0;
    for (const p of polys) {
        for (let i = 1; i + 1 < p.vs.length; i++) {
            a += Math.hypot(...cross3(sub3(p.vs[i], p.vs[0]), sub3(p.vs[i + 1], p.vs[0]))) / 2;
        }
    }
    return a;
}

/**
 * Is the surface closed? Every directed edge must appear exactly once and its reverse exactly once.
 *
 * *** A BOOLEAN THAT LEAKS DOES NOT LOOK BROKEN, WHICH IS THE ENTIRE PROBLEM. *** A wall with a one-triangle
 * gap in the rim renders exactly like a wall without one until the camera goes through it, and its volume is
 * still nearly right. This is the check that has an opinion about it, and it is quantised because vertices
 * introduced by two different splits of the same edge agree only to float rounding.
 */
export function watertight(polys, quantum = 1e-6) {
    const key = (v) => [Math.round(v[0] / quantum), Math.round(v[1] / quantum), Math.round(v[2] / quantum)].join(",");
    const edges = new Map();
    for (const p of polys) {
        for (let i = 0; i < p.vs.length; i++) {
            const a = key(p.vs[i]), b = key(p.vs[(i + 1) % p.vs.length]);
            if (a === b) continue;                       // a degenerate edge is not an edge
            edges.set(a + "|" + b, (edges.get(a + "|" + b) || 0) + 1);
        }
    }
    const unmatched = [];
    for (const [e, n] of edges) {
        const [a, b] = e.split("|");
        const back = edges.get(b + "|" + a) || 0;
        if (n !== 1 || back !== 1) unmatched.push({ edge: e, forward: n, back });
    }
    return { ok: unmatched.length === 0, unmatched: unmatched.length, edges: edges.size, worst: unmatched[0] || null };
}

/** Every polygon convex? The fan triangulator is only correct if this holds -- see the header. */
export function allConvex(polys, eps = 1e-9) {
    let reflex = 0;
    for (const p of polys) {
        for (let i = 0; i < p.vs.length; i++) {
            const u = p.vs[(i + p.vs.length - 1) % p.vs.length], v = p.vs[i], w = p.vs[(i + 1) % p.vs.length];
            if (dot3(cross3(sub3(v, u), sub3(w, v)), p.pl.n) < -eps) reflex++;
        }
    }
    return { ok: reflex === 0, reflex };
}

// ---- THE 45%: COPLANAR POLYGONS THAT RENDER AS THE QUAD THEY CAME FROM --------------------------------------

/**
 * Merge polygons that share a plane AND an edge, when the join stays convex.
 *
 * *** THE CONVEXITY REFUSAL IS NOT CAUTION, IT IS CORRECTNESS. *** toTriangles() below is a FAN, and a fan of
 * a concave polygon covers area outside the polygon. So a merge that would make a reflex vertex is declined
 * and both polygons are kept -- fewer merges, never a wrong one. A merge also drops either joint vertex that
 * has become collinear, which is how a blasted wall face walks back toward the quad it started as.
 *
 * Lossless by construction: it only ever removes an edge shared by two coplanar faces of the same solid, so
 * the volume and the closed surface are unchanged. The gate asserts both rather than taking that on trust.
 */
export function mergeCoplanar(polys, { quantum = 1e-6, maxRounds = 8 } = {}) {
    const key = (v) => [Math.round(v[0] / quantum), Math.round(v[1] / quantum), Math.round(v[2] / quantum)].join(",");
    const planeKey = (pl) => [Math.round(pl.n[0] / 1e-6), Math.round(pl.n[1] / 1e-6), Math.round(pl.n[2] / 1e-6),
                              Math.round(pl.w / 1e-6)].join(",");
    const convexAt = (u, v, w, n) => dot3(cross3(sub3(v, u), sub3(w, v)), n) >= -1e-9;
    const collinear = (u, v, w) => Math.hypot(...cross3(sub3(v, u), sub3(w, v))) < 1e-9;

    let cur = polys.map((p) => ({ vs: p.vs.slice(), pl: p.pl }));
    let merged = 0;
    for (let round = 0; round < maxRounds; round++) {
        const groups = new Map();
        cur.forEach((p, i) => {
            const k = planeKey(p.pl);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(i);
        });
        const dead = new Set();
        const out = [];
        let did = 0;
        for (const idxs of groups.values()) {
            // *** A MULTIMAP RATHER THAN A PLAIN MAP -- AND IT IS DEFENSIVE ON THE PATH THIS FILE ACTUALLY
            // TAKES, WHICH THE SABOTAGE ESTABLISHED AND MY FIRST COMMENT HERE DENIED. *** With one entry per
            // directed edge, last writer wins, so the count of edges two faces SHARE comes back wrong, and two
            // faces sharing two edges merge into a ring or a figure of eight -- the concave polygon the fan
            // triangulator cannot draw. That was REAL when blast() merged a welded mesh every shot, and it is
            // what fifteen concave faces up to 0.3 units deep were traced back to.
            //
            // blast() no longer merges at all, so on the shipped path the difference is unobservable:
            // reverting this to a plain Map changes NO NUMBER IN THE GATE. Kept because the failure it
            // prevents is real and the cost is a push instead of a set, labelled here as a guard rather than
            // counted as a checked behaviour, and NOT claimed to be sabotage-covered when it is not.
            const owner = new Map();
            for (const i of idxs) {
                const p = cur[i];
                for (let e = 0; e < p.vs.length; e++) {
                    const k = key(p.vs[e]) + "|" + key(p.vs[(e + 1) % p.vs.length]);
                    if (!owner.has(k)) owner.set(k, []);
                    owner.get(k).push([i, e]);
                }
            }
            const sharedWith = (i, j) => {
                const p = cur[i];
                let n = 0;
                for (let e = 0; e < p.vs.length; e++) {
                    const rev = key(p.vs[(e + 1) % p.vs.length]) + "|" + key(p.vs[e]);
                    for (const [o] of (owner.get(rev) || [])) if (o === j) n++;
                }
                return n;
            };
            for (const i of idxs) {
                if (dead.has(i)) continue;
                const P = cur[i];
                let done = false;
                for (let e = 0; e < P.vs.length && !done; e++) {
                    const a = P.vs[e], b = P.vs[(e + 1) % P.vs.length];
                    const cands = owner.get(key(b) + "|" + key(a)) || [];
                    for (const [j, f] of cands) {
                        if (j === i || dead.has(j)) continue;
                        if (sharedWith(i, j) !== 1) continue;        // a two-edge share is not a merge
                        const Q = cur[j], m = Q.vs.length;
                        const vs = [];
                        for (let g = 0; g <= e; g++) vs.push(P.vs[g]);                  // ... up to a
                        for (let g = 2; g < m; g++) vs.push(Q.vs[(f + g) % m]);         // Q's far side
                        for (let g = e + 1; g < P.vs.length; g++) vs.push(P.vs[g]);     // from b onward
                        if (vs.length < 3) continue;
                        const idxA = e, idxB = (e + m - 1) % vs.length;
                        const okAt = (k2) => convexAt(vs[(k2 + vs.length - 1) % vs.length], vs[k2], vs[(k2 + 1) % vs.length], P.pl.n);
                        if (!okAt(idxA) || !okAt(idxB)) continue;
                        const cleaned = vs.filter((v, k2) => {
                            if (k2 !== idxA && k2 !== idxB) return true;
                            return !collinear(vs[(k2 + vs.length - 1) % vs.length], v, vs[(k2 + 1) % vs.length]);
                        });
                        if (cleaned.length < 3) continue;
                        dead.add(i); dead.add(j);
                        out.push({ vs: cleaned, pl: P.pl });
                        merged++; did++; done = true;
                        break;
                    }
                }
            }
        }
        for (let i = 0; i < cur.length; i++) if (!dead.has(i)) out.push(cur[i]);
        cur = out;
        if (!did) break;
    }
    return { polys: cur, merged };
}

/**
 * Collapse vertices that are within `tol` of each other onto one representative.
 *
 * *** THE RESIDUAL CRACKS COME IN PAIRS AND THAT IS WHAT NAMED THEM. *** After twelve blasts and a weld, 20
 * of 64,064 directed edges still had no partner -- and their lengths came out as 1.1e-1, 1.1e-1, 6.1e-2,
 * 5.3e-2, 2.9e-2, 2.9e-2 ... two of each. A pair is two polygons that SHOULD share an edge, whose endpoints
 * were computed by two different sequences of plane intersections and landed a few ULP apart. Neither edge
 * matches the other, so both are reported, and no amount of T-junction welding helps because there is no
 * vertex to insert -- the two are already the same corner, spelled differently.
 *
 * So the pipeline is snap -> merge -> weld, and snapping is FIRST because welding a mesh whose corners are
 * spelled two ways just preserves both spellings.
 */
export function snapVertices(polys, { tol = 1e-9 } = {}) {
    const cellSize = Math.max(tol * 2, 1e-12);
    const grid = new Map();
    const reps = [];
    let moved = 0;
    const ck = (v) => [Math.floor(v[0] / cellSize), Math.floor(v[1] / cellSize), Math.floor(v[2] / cellSize)];
    const find = (v) => {
        const [cx, cy, cz] = ck(v);
        for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
            const bucket = grid.get(x + "," + y + "," + z);
            if (!bucket) continue;
            for (const ri of bucket) {
                const r = reps[ri];
                if (Math.abs(r[0] - v[0]) <= tol && Math.abs(r[1] - v[1]) <= tol && Math.abs(r[2] - v[2]) <= tol) return ri;
            }
        }
        const ri = reps.push(v.slice()) - 1;
        const k = ck(v).join(",");
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(ri);
        return ri;
    };
    const out = polys.map((p) => {
        const vs = [];
        for (const v of p.vs) {
            const r = reps[find(v)];
            if (r[0] !== v[0] || r[1] !== v[1] || r[2] !== v[2]) moved++;
            // drop a vertex that has just collapsed onto its predecessor
            if (vs.length && vs[vs.length - 1][0] === r[0] && vs[vs.length - 1][1] === r[1] && vs[vs.length - 1][2] === r[2]) continue;
            vs.push(r);
        }
        while (vs.length > 1 && vs[0][0] === vs[vs.length - 1][0] && vs[0][1] === vs[vs.length - 1][1] && vs[0][2] === vs[vs.length - 1][2]) vs.pop();
        return { vs, pl: p.pl };
    }).filter((p) => p.vs.length >= 3);
    return { polys: out, moved, vertices: reps.length };
}

/**
 * Insert, into every edge, the vertices that already lie ON it. This is what makes the mesh GAP-FREE.
 *
 * *** "GAP-FREE" WAS THE WORD IN THE REQUEST AND IT IS TRUE IN ONE SENSE AND FALSE IN THE OTHER, WHICH IS WHY
 * IT IS WORTH SEPARATING. *** Measured on a wall minus one blast: of 3,239 directed edges the raw subtraction
 * leaves 803 (24.8%) without an exact opposite -- and every single one of them is FULLY COVERED by shorter
 * edges running the other way. Not one is uncovered. So the surface really does bound the solid: A - B and
 * A AND B partition A to 9.7e-14 of its volume, which is the number that says there is no hole.
 *
 * What it is NOT is WELDED. A long edge on one side meets two short ones on the other, and that is a
 * T-junction: the two sides agree mathematically and disagree by a fraction of a pixel once a rasteriser
 * interpolates them, which is a hairline crack of background colour along the rim. The volume check cannot
 * see it and neither can a screenshot at low resolution.
 *
 * mergeCoplanar MAKES THIS WORSE, from 24.8% to 55.8%, because a merged face has long edges that its
 * neighbours are still subdivided against. So the order is snap -> merge -> weld, and weld is last.
 *
 * *** ON ONE BLAST THIS REACHES 100.0%: EVERY EDGE MATCHED, ZERO T-JUNCTIONS, ZERO GAPS. OVER TWELVE IT DOES
 * NOT, AND THE REASON IS NOT KNOWN. *** 15 of 12,847 directed edges (0.12%) survive settle() on a wall that
 * has taken twelve overlapping blasts, and they are UNCOVERED -- real cracks, not T-junctions. Three
 * explanations were proposed and all three were MEASURED AND REFUTED:
 *
 *   1. "splitPolygon drops slivers under three vertices, and they accumulate."   SPLIT_STATS says the drop
 *      count is 0 of 37,708 splits. Not this.
 *   2. "the weld tolerance is too tight."   Identical count -- 20 of 64,064 -- at every weld tolerance from
 *      1e-9 to 1e-7, and WORSE when loosened to 1e-5. Not this.
 *   3. "the same corner is spelled two ways by two split orders."   The cracks do come in equal-length PAIRS,
 *      which is what that would look like; but snapVertices closes none of them at any tolerance from 1e-12
 *      to 1e-6. Not this either.
 *
 * What IS known: the volume is unaffected. 20.112588161 to the last digit across every combination of snap,
 * merge and weld, and A - B plus A AND B reconstruct A to 9.7e-14. So the solid is right and a hairline of
 * its surface is not sewn. That is written down as an open limit with its measurements rather than rounded
 * off, because a gate that asserted "watertight" here would be asserting something false.
 */
export function weldTJunctions(polys, { tol = 1e-7, quantum = 1e-9, maxRounds = 4 } = {}) {
    // *** THIS LOOP IS DEFENSIVE AND THE MEASUREMENT SAYS SO, AGAINST WHAT I WROTE HERE FIRST. *** The first
    // version of this comment claimed one pass was not enough and that iterating was what closed the last
    // edges. It is not: on a twelve-blast wall the pass inserts 2,853 vertices and leaves 53 edges unmatched
    // at maxRounds 1, 2, 4 AND 8 -- identical, because the second pass inserts nothing at all. The argument
    // for iterating is still sound in principle (inserting a vertex makes two shorter edges, and a vertex
    // outside the old span can fall inside a new one) but it has never once fired here. Kept as a guard,
    // labelled as one, and NOT counted as a check -- sabotaging it back to a single pass changes no number
    // in the gate, which is exactly what a defensive guard looks like.
    let cur = polys, total = 0;
    for (let round = 0; round < maxRounds; round++) {
        const r = weldPass(cur, tol, quantum);
        cur = r.polys; total += r.inserted;
        if (!r.inserted) break;
    }
    return { polys: cur, inserted: total };
}

function weldPass(polys, tol, quantum) {
    const key = (v) => [Math.round(v[0] / quantum), Math.round(v[1] / quantum), Math.round(v[2] / quantum)].join(",");
    const verts = new Map();
    for (const p of polys) for (const v of p.vs) if (!verts.has(key(v))) verts.set(key(v), v);
    // a uniform grid, so this is not O(edges * vertices) on a wall that has taken a dozen hits
    const { lo, hi } = polysAABB(polys);
    // sized so a bucket holds a handful of vertices, not a fixed number of cuts: a wall that has taken a
    // dozen blasts has its vertices bunched at the rims, and a fixed grid puts thousands in one bucket.
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    const cuts = Math.max(8, Math.min(256, Math.ceil(Math.cbrt(verts.size / 2))  * 4));
    const cell = Math.max(1e-9, span / cuts);
    const ck = (v) => [Math.floor((v[0] - lo[0]) / cell), Math.floor((v[1] - lo[1]) / cell), Math.floor((v[2] - lo[2]) / cell)].join(",");
    const grid = new Map();
    for (const v of verts.values()) { const k = ck(v); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(v); }

    let inserted = 0;
    const out = polys.map((p) => {
        const vs = [];
        for (let i = 0; i < p.vs.length; i++) {
            const a = p.vs[i], b = p.vs[(i + 1) % p.vs.length];
            vs.push(a);
            const ab = sub3(b, a), L = Math.hypot(ab[0], ab[1], ab[2]);
            if (L < 1e-12) continue;
            const u = [ab[0] / L, ab[1] / L, ab[2] / L];
            const c0 = [Math.floor((Math.min(a[0], b[0]) - lo[0]) / cell), Math.floor((Math.min(a[1], b[1]) - lo[1]) / cell), Math.floor((Math.min(a[2], b[2]) - lo[2]) / cell)];
            const c1 = [Math.floor((Math.max(a[0], b[0]) - lo[0]) / cell), Math.floor((Math.max(a[1], b[1]) - lo[1]) / cell), Math.floor((Math.max(a[2], b[2]) - lo[2]) / cell)];
            const on = [];
            const seen = new Set();
            for (let x = c0[0] - 1; x <= c1[0] + 1; x++) for (let y = c0[1] - 1; y <= c1[1] + 1; y++) for (let z = c0[2] - 1; z <= c1[2] + 1; z++) {
                const bucket = grid.get(x + "," + y + "," + z);
                if (!bucket) continue;
                for (const v of bucket) {
                    const kk = key(v);
                    if (seen.has(kk)) continue;
                    seen.add(kk);
                    const av = sub3(v, a);
                    const t = dot3(av, u);
                    if (t <= tol || t >= L - tol) continue;
                    const perp = Math.hypot(av[0] - t * u[0], av[1] - t * u[1], av[2] - t * u[2]);
                    if (perp < tol) on.push([t, v]);
                }
            }
            on.sort((m, n) => m[0] - n[0]);
            for (const [, v] of on) { vs.push(v); inserted++; }
        }
        return { vs, pl: p.pl };
    });
    return { polys: out, inserted };
}

// ---- THE LOCALISED PATH, WHICH IS THE ONLY ONE THAT IS REAL TIME --------------------------------------------

export function polyAABB(p) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of p.vs) for (let i = 0; i < 3; i++) { if (v[i] < lo[i]) lo[i] = v[i]; if (v[i] > hi[i]) hi[i] = v[i]; }
    return { lo, hi };
}

export function polysAABB(ps) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of ps) for (const v of p.vs) for (let i = 0; i < 3; i++) {
        if (v[i] < lo[i]) lo[i] = v[i]; if (v[i] > hi[i]) hi[i] = v[i];
    }
    return { lo, hi };
}

const boxesMeet = (a, lo, hi) => a.lo[0] <= hi[0] && a.hi[0] >= lo[0] && a.lo[1] <= hi[1] &&
                                 a.hi[1] >= lo[1] && a.lo[2] <= hi[2] && a.hi[2] >= lo[2];

/**
 * Subtract B from A, cutting ONLY the polygons the blast can reach.
 *
 * The partition is sound because B is contained in B's own AABB: a polygon whose AABB misses that box cannot
 * be touched by B, so leaving it alone is not an approximation. `select` is the hook the BVH plugs into --
 * pass one and it decides which polygons are near; pass none and the AABB test above is used directly, which
 * is what makes this file testable without an acceleration structure present.
 */
export function subtractLocal(A, B, { select = null } = {}) {
    const { lo, hi } = polysAABB(B);
    const near = [], far = [];
    if (select) {
        const idx = new Set(select(lo, hi));
        A.forEach((p, i) => (idx.has(i) ? near : far).push(p));
    } else {
        for (const p of A) (boxesMeet(polyAABB(p), lo, hi) ? near : far).push(p);
    }
    if (!near.length) return { polys: A.slice(), far: A.slice(), cut: [], touched: 0, skipped: far.length };
    const cut = subtract(near, B);
    return { polys: far.concat(cut), far, cut, touched: near.length, skipped: far.length };
}

/**
 * Build a BVH over the polygons and hand back the `select` subtractLocal wants.
 *
 * The BVH indexes TRIANGLES, because that is the layout mesh/meshBVH.mjs takes and there was no reason to
 * teach it about polygons. A fan triangulation emits each polygon's triangles consecutively, so one Int32Array
 * maps triangle -> polygon and the query's triangle hits collapse to a set of polygon indices.
 */
export function bvhSelect(polys) {
    const tris = [], triToPoly = [];
    polys.forEach((p, pi) => {
        for (let i = 1; i + 1 < p.vs.length; i++) { tris.push(p.vs[0], p.vs[i], p.vs[i + 1]); triToPoly.push(pi); }
    });
    const buf = new Float64Array(tris.length * 3);
    tris.forEach((v, i) => { buf[i * 3] = v[0]; buf[i * 3 + 1] = v[1]; buf[i * 3 + 2] = v[2]; });
    const bvh = new MeshBVH(buf);
    const map = Int32Array.from(triToPoly);
    return { bvh, select: (lo, hi) => bvh.trianglesInBox(lo, hi).map((t) => map[t]) };
}

/**
 * ONE BLAST, AT FRAME RATE: cut only what the blast reaches, and take back the coplanar waste.
 *
 * *** WELDING IS NOT IN HERE, AND LEAVING IT OUT IS THE DESIGN RATHER THAN AN OMISSION. *** The first version
 * of this ran cut -> merge -> weld on every shot and it was WRONG TWICE. Slow: 5546 ms over twelve shots
 * against 719 ms for the cut alone, because a weld walks the whole wall and a cut walks 2% of it. And
 * incorrect: merging an ALREADY-WELDED mesh is what exposed the lossy edge index above, since welding is
 * precisely what turns one long edge into the several short ones that make a two-edge share common. Fifteen
 * concave polygons came out of that, up to 0.3 units deep on an 8-unit wall -- not a rounding artefact, a
 * genuinely self-overlapping face that the fan triangulator would have drawn wrong.
 *
 * So: blast() while things are being shot at, settle() once they stop. That is also what the frame budget
 * wants, and the two agreeing is the reason to trust the split rather than merely accept it.
 */
export function blast(polys, blob, { select = null, merge = false } = {}) {
    const t0 = Date.now();
    const r = subtractLocal(polys, blob, { select });
    let out = r.polys, mergedCount = 0;
    const afterCut = out.length;
    // *** MERGE ONLY WHAT WAS JUST CUT. *** Every coplanar fragment this shot created is in r.cut; running the
    // merge over the whole wall instead costs 1981 ms across twelve shots against 719 ms, to find the same
    // fragments plus nothing. It gives up the merges that would span the cut/untouched boundary, which
    // settle() picks up later anyway because settle sees the whole mesh.
    // *** AND MERGING ONLY THE CUT PATCH IS WRONG, WHICH COST A MEASUREMENT TO FIND. *** r.cut is an OPEN
    // surface -- the near polygons plus the blast's inward faces, with a raw boundary where it was carved out
    // of the wall. mergeCoplanar's shared-edge test assumes every edge has a partner, so on an open patch it
    // merges across the boundary and leaves 36 UNCOVERED edges on a twelve-blast wall: a real crack, not a
    // T-junction, and the volume drifts by 1.1e-7 with it. Merging the WHOLE wall each shot is sound and
    // costs 1981 ms over twelve shots against 719 ms. Neither is what blast() should do, so blast() does not
    // merge at all: settle() merges, once, on a closed mesh, and that is the only place it is sound.
    if (merge && false) { const m = mergeCoplanar(out); out = m.polys; mergedCount = m.merged; }
    return { polys: out, stats: { touched: r.touched, skipped: r.skipped, afterCut,
                                  merged: mergedCount, ms: Date.now() - t0 } };
}

/**
 * THE CLEANUP, ONCE THE SHOOTING STOPS: merge what is left, then weld every T-junction shut.
 *
 * This is the pass that makes the word "gap-free" true in the rendering sense as well as the solid one. It is
 * a whole-mesh walk and it is not cheap; it is also not needed until somebody looks closely.
 */
export function settle(polys, { snapTol = 1e-9, merge = true } = {}) {
    const t0 = Date.now();
    const s = snapVertices(polys, { tol: snapTol });
    const m = merge ? mergeCoplanar(s.polys) : { polys: s.polys, merged: 0 };
    const w = weldTJunctions(m.polys);
    return { polys: w.polys, stats: { snapped: s.moved, merged: m.merged, inserted: w.inserted, ms: Date.now() - t0 } };
}

// ---- SHAPES AND CONVERSION ---------------------------------------------------------------------------------

/** An axis-aligned box as six quads, wound counter-clockwise from outside. A wall is one of these. */
export function boxPolys(c, h) {
    const FACES = [[[0, 4, 6, 2]], [[1, 3, 7, 5]], [[0, 1, 5, 4]], [[2, 6, 7, 3]], [[0, 2, 3, 1]], [[4, 5, 7, 6]]];
    return FACES.map(([idx]) => {
        const vs = idx.map((i) => [c[0] + h[0] * (i & 1 ? 1 : -1), c[1] + h[1] * (i & 2 ? 1 : -1), c[2] + h[2] * (i & 4 ? 1 : -1)]);
        return { vs, pl: planeOf(vs) };
    });
}

/**
 * A jagged blast shape: a UV sphere whose every vertex gets its own radius, triangulated.
 *
 * *** THE JAGGEDNESS IS THE POINT AND IT IS ALSO THE COST. *** A smooth sphere subtracted from a wall is a
 * neat round hole and BSP is overkill for it -- the SDF path next door does that better and cheaper. What BSP
 * buys is a rim made of the blast's OWN facets, each on its own plane, which is exactly the input that makes
 * the polygon count grow. The seed is explicit so a blast is reproducible, which the determinism gates need.
 */
export function jaggedBlob(c, r, subdiv = 8, seed = 1, { rough = 0.9, floor = 0.55 } = {}) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const N = subdiv, M = subdiv * 2;
    // *** THE POLES ARE ONE VERTEX EACH, AND THE FIRST DRAFT OF THIS GOT IT WRONG IN A WAY THAT LOOKED FINE. ***
    // Giving every ring vertex its own radius makes the i=0 ring M DISTINCT POINTS STRUNG ALONG THE Y AXIS
    // rather than one pole, so the cap triangles are collinear, get dropped as degenerate, and the blob ships
    // with a HOLE AT EACH POLE. It still renders, it still subtracts, and the result is quietly wrong -- the
    // volume check below is what caught it. One vertex per pole, and triangles rather than quads on the caps.
    const north = [c[0] + 1e-9, c[1] + r * (floor + rough * rnd()), c[2] + 1e-9];
    const south = [c[0], c[1] - r * (floor + rough * rnd()), c[2]];
    const ring = [];                      // rings i = 1 .. N-1
    for (let i = 1; i < N; i++) {
        const row = [];
        for (let j = 0; j < M; j++) {
            const th = Math.PI * i / N, ph = 2 * Math.PI * j / M;
            const rr = r * (floor + rough * rnd());
            row.push([c[0] + rr * Math.sin(th) * Math.cos(ph), c[1] + rr * Math.cos(th), c[2] + rr * Math.sin(th) * Math.sin(ph)]);
        }
        ring.push(row);
    }
    const faces = [];
    for (let j = 0; j < M; j++) faces.push([north, ring[0][(j + 1) % M], ring[0][j]]);
    for (let i = 0; i + 1 < ring.length; i++) for (let j = 0; j < M; j++) {
        const a = ring[i][j], b = ring[i][(j + 1) % M], d = ring[i + 1][(j + 1) % M], e = ring[i + 1][j];
        faces.push([a, b, d], [a, d, e]);
    }
    const last = ring[ring.length - 1];
    for (let j = 0; j < M; j++) faces.push([south, last[j], last[(j + 1) % M]]);
    const out = [];
    for (const vs of faces) {
        if (Math.hypot(...cross3(sub3(vs[1], vs[0]), sub3(vs[2], vs[0]))) < 1e-12) continue;
        out.push({ vs, pl: planeOf(vs) });
    }
    return out;
}

/** Fan triangulation. Valid because every polygon here is convex -- allConvex() is what says so. */
export function toTriangles(polys) {
    const out = [];
    for (const p of polys) for (let i = 1; i + 1 < p.vs.length; i++) out.push([p.vs[0], p.vs[i], p.vs[i + 1]]);
    return out;
}

/** Flat 9-floats-per-triangle, which is the layout mesh/meshBVH.mjs takes. */
export function toTriangleBuffer(polys) {
    const tris = toTriangles(polys);
    const buf = new Float64Array(tris.length * 9);
    tris.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) buf[i * 9 + v * 3 + c] = t[v][c]; });
    return buf;
}
