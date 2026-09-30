// WebGLEngine/physics/mesh/triArrangement.mjs
//
// *** ROUND 9 OF THE BVH-CSG ARC: SEGMENT-BOUNDED CUTTING. *** triFragmentAccumulate.mjs's ROUND 8 paragraph named
// the two costs its spatial index could not touch, both scaling with fragment count: (1) a cut ran a B-triangle's
// whole PLANE across the fragment it split, so early cuts left long slivers later members cut again (37,458
// fragments from 5,360 candidates at subdiv 64; over 65,536 on ONE wall triangle at 128, which capped and came
// back wrong); (2) pointInMesh() fired five rays per fragment, ~85% of the time. It named the fix: cut triA only
// along the actual intersection SEGMENTS, find the regions they enclose, classify once per region. THIS FILE.
//
// THE ALGORITHM, per triangle triA of one mesh against its candidate B-triangles of the other:
//   1. SEGMENTS: round 2's triTriIntersect() for every candidate whose box meets triA's. "coplanar" or
//      "degenerate" (a vertex within 1e-9 of the other's plane) REFUSES the whole triangle -- see FALLBACK.
//      A segment no longer than the snap distance is a point contact and is dropped (counted).
//   2. A 2D FRAME on triA's plane: drop the dominant normal axis, local origin at triA's first corner, mirrored
//      so triA runs counter-clockwise -- faces then come out wound like triA with no per-face test.
//   3. VERTICES, SNAPPED: triA's corners, then every segment end, merged with any existing vertex within
//      SNAP_EPS (1e-9, absolute -- the same scale as triTriIntersect's and triClip's EPS). A merged vertex keeps
//      the FIRST coordinates it was given; nothing is projected or averaged.
//   4. EDGES, SPLIT: triA's sides and the segments; every proper crossing between two of them adds a vertex
//      (none on a manifold, non-self-intersecting B -- counted), and every vertex within snap of an edge's
//      interior splits it (segment ends on triA's sides; T-junctions between segments). Duplicates collapse.
//   5. A VERTEX OF DEGREE 1 REFUSES: a segment chain that stops inside triA means B's surface crosses the face it
//      sits in, and no single point could then speak for that face. Refused, not pruned.
//   6. FACES by the standard walk (next(u->v) = v->w, w the neighbour of v clockwise-next after u; faces on the
//      left). Positive cycles are faces; the negative cycle through triA's first corner is the outside; every
//      other negative cycle is a HOLE (a loop B cuts strictly inside triA -- a spike through a wall face),
//      given to the smallest face of ANOTHER connected component that contains it. Checks, each a refusal:
//      no cycle thinner than snap (|area| <= snap x perimeter), the outside's area is -area(triA), and faces
//      minus holes sum to area(triA) -- all to snap x perimeter (see TOLERANCES).
//   7. TRIANGULATION: vendored three.js's Earcut (ShapeUtils.triangulateShape, holes supported; importing
//      three.core.js in Node measured 42 ms). Each ring is SIMPLIFIED first and the absorbed vertices fanned
//      back (see SLIVERS). Triangle areas must sum to the face's; every face vertex must be used.
//   Then meshBoolean.mjs classifies each face ONCE, at the centroid of its largest triangle, and gives every
//   triangle of the face that label.
//
// *** WHY THE OUTPUT IS WATERTIGHT RAW, WHICH NO EARLIER ROUND'S WAS. *** triTriIntersect(a, b) and
// triTriIntersect(b, a) compute each segment end by the same formula from the same numbers (the Moller interval
// of whichever triangle's edge it lies on), so A's arrangement and B's receive the SAME points, bit for bit --
// 224 of 224 intersecting pairs on the subdiv-16 blast (triArrangement-selfcheck section 4) -- and both keep them
// as given. The plane path derived each side's cut from a representative plane and interpolated through a
// different chain of clips per side: 16 of 33 seam vertices within 1e-6 on meshBoolean-selfcheck's primary
// fixture, 3 bit-identical; here 22 of 22, bit-identical. Raw unmatched edges (meshCSG's watertight(), 1e-6
// key), one blast, wall minus jaggedBlob subdiv n: arrangement 0 at n = 8, 16, 32, 48, 64, 96, 128; plane path
// 481, 1,169, 5,012, 12,057, 23,478, 66,178. The twelve-blast chain ends at 0 raw.
//
// FALLBACK, PER TRIANGLE, NEVER A WRONG FACE: a refused triangle goes to triFragmentAccumulate.mjs's plane path
// exactly as before round 9 (meshBoolean.mjs does this; reasons are counted in its stats.fallbackReasons). In
// practice only flush and coincident contacts refuse -- coplanar or degenerate pairs: 120 of 5,907 arranged
// triangles over a 153-run battery (flush faces, identical boxes, through-flush), each then equal to the plane
// path's own result. Zero refusals on 40 rotated boxes, 6 blob pairs, every blast size 8..128, and the
// twelve-blast chain. The refusals no fixture reaches are listed by name in the gate's census (section 5).
//
// MEASURED, ONE BLAST (wall minus jaggedBlob subdiv n; arrangement / plane path / meshCSG BSP; one machine, the
// plane and BSP runs at 64 and 96 contended by a parallel job):
//   n=8     26 ms / 32 ms          280 vs 473 triangles       330 vs 952 classifications
//   n=32   112 ms / 554 ms         3,220 vs 6,141             4,749 vs 12,824
//   n=48   355 ms / 2.42 s         7,106 vs 14,519            10,668 vs 30,194
//   n=64   0.80 s / 7.3 s / BSP 2.4 s        12,354 vs 28,164 triangles
//   n=96   1.7 s / 45.7 s / BSP 5.7 s        27,906 vs 76,408
//   n=128  3.9 s / capped and wrong at round 8 (129.5 s) / BSP 12.6 s     49,520 triangles, uncapped
// Classifications per blob triangle: 1.47, 1.25, 1.20, 1.18, 1.18, 1.17 for n = 8, 16, 32, 48, 64, 128 -- flat;
// the plane path's 4.25 at n=8, then 3.1 at 16 rising to 4.3 at 96. Volumes: the arrangement matches the plane
// path wherever the plane path is uncapped -- worst 5.0e-13 at n=96 (1.8e-14 relative; 3.8e-13 at 64, 1.5e-13 at
// 32). At n=128, where only the BSP is left to compare, the two disagree by 1.5e-5 -- and at 1000x scale the BSP
// and the arrangement agree to 1e-15 relative, the arrangement at 1x meets that reference to 1.9e-14, the BSP at
// 1x missed it by 5.6e-7 at its EPS of the time, 1e-5 (round 10 of this arc set 1e-8, and it meets it to
// 8.5e-14). WHERE THE TIME GOES NOW (n=128): arranging 3.35 s, classifying 0.48 s -- the opposite of round 8's profile. One wall triangle carries 2,735 segments and takes
// 733 ms: steps 3 and 4 are brute force (snapping O(V) per vertex, crossings O(k^2), vertex-on-edge O(V x E)).
// A grid over triA's plane is the next piece if a larger workload needs it; not built.
//
// WHAT THIS ROUND'S OWN RUNS FOUND IN ITS OWN FIRST DRAFTS (each now pinned in triArrangement-selfcheck.mjs):
//   (a) THE MIRROR SIGN. The 2D frame was mirrored by the sign of the dropped normal component alone; with y
//       dropped, (x,z) is a left-handed pair, so every y-dominant triangle came out clockwise and refused -- 28
//       of 224 blob triangles at n=8, 137 at n=32. The area check turned the bug into fallbacks, not wrong
//       faces. (Gate 1k: the same cut in all six orientations.)
//   (b) EARCUT DROPS AN EXACTLY COLLINEAR VERTEX -- a box face is two coplanar triangles whose segments meet
//       at the diagonal's crossing, collinear with their other ends; the face across keeps that vertex, so
//       dropping it left a T-junction: 3 unmatched edges on 10 of 120 rotated-box runs. (Gate 1c.)
//   (c) SLIVERS. Vertices on triA's straight sides are collinear only to rounding, and Earcut cut ears between
//       them: triangles of area 1e-17..7e-21 on the twelve-blast chain, whose normals are noise; meshCSG's
//       settle() could not merge them (467 unmatched after settle at shot 12) and, fed back in as later shots'
//       triA, they were refused ('outer face'). FIXED by simplifying each ring before Earcut -- a vertex goes if
//       it and every vertex already absorbed beside it lie within snap of the segment joining its surviving
//       neighbours -- and fanning each absorbed run back into the one triangle that owns that edge. Every vertex
//       comes back; no triangle is thinner than snap (gate section 2: thinnest height 6.1e-5 over 200 cases).
//   (d) A DEGENERATE CYCLE WAS "SMALL AGAINST triA" (|area| <= 1e-9 x area(triA)). A spike tip grazing the wall
//       face encloses a genuine loop of area 9.3e-10 or 2.0e-8; two wall triangles fell back at n=64 and their
//       plane-path fragments opened 12,970 edges. It is "thinner than snap" now: |area| <= snap x perimeter.
//       (Gates 1i, refused; 1l, a 5e-9 loop accepted.)
//   (e) AREA TOLERANCES WERE RELATIVE TO AREA. A segment end 1e-10 off triA's side moves the outside's area by
//       up to snap x perimeter, not by a fraction of the area: outer cycle -0.024136561511 against triA
//       0.024136561575 on chain shot 6, refused. TOLERANCES below. (Gate 1j, at 1/100 of 1d's size.)
//   (f) THE SHOELACE RAN ABOUT triA's CORNER, and a 5e-9 face near (1,1) lost 3.0e-17 (6e-9 relative) to
//       cancellation. Each cycle is measured about its own first vertex now: 1.1e-20. (Gate 1l.)
//
// TOLERANCES: vertex snap SNAP_EPS; a cycle is degenerate below snap x its perimeter; the outside and the face
// sum must match area(triA) to snap x perimeter(triA) + 1e-9 x area(triA); a face's triangles must sum to its
// area to snap x its rings' perimeter. Every vertex may sit up to snap from where exact arithmetic would put it,
// and moving a polygon's vertices by d moves its area by at most d x its perimeter. Consequence, pinned in gate
// 1d: a segment end within snap INSIDE triA's side is kept where it is and split into the side, leaving an
// uncovered sliver of (side length) x (offset) / 2 -- 2e-10 there, by hand. The neighbouring triangle across
// that side receives the same point, so the mesh stays conforming; the sliver is geometry, not a crack.
//
// KNOWN AND NOT FIXED HERE:
//   - ABSOLUTE SNAP. 1e-9 is a length, like every tolerance in this arc: below ~1e-4 scale it is no longer small
//     against the geometry. ROUND 11 answered that for uniform scale in meshBoolean(), which hands this file
//     operands whose joint extent is in [1, 16); it did not for a part far from the origin (coordinates, not extent,
//     set the ULP) or for a feature tiny against its part (meshBoolean.mjs's ROUND 11 paragraph has both measured).
//     A caller of arrangeTriangle() other than meshBoolean() gets no normalisation. Two vertices 1.07e-9 apart -- jaggedBlob's
//     north pole is offset by an absolute 1e-9 -- stay distinct here and coincide under meshCSG's 1e-6 census
//     key, which reads them as a T-junction: 2 unmatched edges on shots 7..11 of the twelve-blast chain, 0 at 12.
//   - COPLANAR AND DEGENERATE CONTACTS go to the plane path whole, with the plane path's known flush-contact
//     gaps (meshBoolean.mjs header; round 12). The flush rod in meshBoolean-selfcheck section 15 is one: open,
//     its cap missing, identical on both paths.
//   - ONE LABEL PER FACE RESTS ON STEP 5 AND ON THE CANDIDATE LIST. A face is classified once only because no
//     segment crosses it -- gate section 2 checks exactly that on 200 random cases, and section 3 audits
//     per-face against per-triangle labels (1,120 triangles, 0 disagree) -- but a B-triangle missing from the
//     candidate list (bvhPairOverlap.mjs's conservative-superset contract says it cannot be) would now mislabel
//     a whole face, where the plane path would have mislabelled one fragment. meshBoolean.mjs says so too.
//   - meshCSG's settle() MAKES THIS OUTPUT WORSE: its coplanar merge opens edges its weld cannot all close (3
//     left on the twelve-blast chain, from 0 raw). The output needs no settle; meshBooleanBlast section 5.
"use strict";

import { ShapeUtils, Vector2 } from "../../vendor/three/three.core.js";
import { triTriIntersect } from "./triTriIntersect.mjs";

export const SNAP_EPS = 1e-9;
const AREA_REL = 1e-9;

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function readTri(tris, t) {
    const o = t * 9;
    return [
        [tris[o], tris[o + 1], tris[o + 2]],
        [tris[o + 3], tris[o + 4], tris[o + 5]],
        [tris[o + 6], tris[o + 7], tris[o + 8]],
    ];
}
function box3(tri, pad) {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const v of tri) for (let c = 0; c < 3; c++) { if (v[c] < b[c]) b[c] = v[c]; if (v[c] > b[3 + c]) b[3 + c] = v[c]; }
    for (let c = 0; c < 3; c++) { b[c] -= pad; b[3 + c] += pad; }
    return b;
}
function boxesMeet(a, b) {
    return a[0] <= b[3] && b[0] <= a[3] && a[1] <= b[4] && b[1] <= a[4] && a[2] <= b[5] && b[2] <= a[5];
}
// Shoelace about the polygon's OWN first vertex: about a far origin a small face loses its area to cancellation
// (a 5e-9 loop near (1,1) read 3.0e-17 short about triA's corner -- 6e-9 relative; about itself, exact).
function area2(pts) {
    let a = 0;
    const ox = pts[0][0], oy = pts[0][1];
    for (let i = 1, n = pts.length; i + 1 < n; i++) {
        const p = pts[i], q = pts[i + 1];
        a += (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy);
    }
    return a / 2;
}
function triArea2(a, b, c) { return ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; }
// Distance from q to segment ab, and the parameter of its foot along ab.
function segDist(q, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    if (L2 === 0) return { d: Math.hypot(q[0] - a[0], q[1] - a[1]), t: 0 };
    const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2;
    const tc = t < 0 ? 0 : (t > 1 ? 1 : t);
    return { d: Math.hypot(q[0] - a[0] - tc * dx, q[1] - a[1] - tc * dy), t };
}
function pointInPoly(q, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

const refuse = (reason, extra = {}) => ({ status: "fallback", reason, ...extra });

/**
 * The planar arrangement of triangle `triA` (in `trisA`) cut by the intersection SEGMENTS of `candidateTriBs`
 * (indices into `trisB`) -- not by their planes. See this file's header.
 *
 * @param {{snapEps?:number}} [opts]
 * @returns one of
 *   {status:"untouched"}  -- no candidate crosses triA: triA is one face (the caller classifies it whole)
 *   {status:"ok", faces:{tris:number[][][], sample:number[], area:number, holes:number}[], stats:object}
 *   {status:"fallback", reason:string}  -- the arrangement refused; the caller must use the plane path
 */
export function arrangeTriangle(trisA, triA, trisB, candidateTriBs, opts = {}) {
    const snap = opts.snapEps ?? SNAP_EPS;
    const T = readTri(trisA, triA);
    const tb = box3(T, snap);

    // ---- 1. the segments (round 2's triTriIntersect), refusing whatever it leaves unresolved -------------------
    const segs = [];
    const seen = new Set();
    let pointContacts = 0;
    for (const triB of candidateTriBs || []) {
        if (seen.has(triB)) continue;
        seen.add(triB);
        if (!boxesMeet(tb, box3(readTri(trisB, triB), 0))) continue;
        const r = triTriIntersect(trisA, triA, trisB, triB);
        if (r.status === "none") continue;
        if (r.status !== "intersect") return refuse(r.status, { triB });
        const d = sub(r.p1, r.p0);
        if (Math.hypot(d[0], d[1], d[2]) <= snap) { pointContacts++; continue; }
        segs.push({ p0: r.p0, p1: r.p1, triB });
    }
    if (segs.length === 0) return { status: "untouched", pointContacts };

    // ---- 2. a 2D frame on triA's plane: drop the dominant normal axis, local origin at T[0], mirrored if needed so
    // that triA itself runs counter-clockwise (faces are then found counter-clockwise and wound like triA) ----------
    const n = cross(sub(T[1], T[0]), sub(T[2], T[0]));
    const an = n.map(Math.abs);
    const drop = an[0] >= an[1] && an[0] >= an[2] ? 0 : (an[1] >= an[2] ? 1 : 2);
    const ax = drop === 0 ? 1 : 0, bx = drop === 2 ? 1 : 2;
    // (x,z) is a left-handed pair when y is dropped: the 2D area there is -n.y/2, not +n.y/2
    const mirror = (drop === 1 ? -n[drop] : n[drop]) < 0 ? -1 : 1;
    const o = T[0];
    const to2 = (p) => [p[ax] - o[ax], (p[bx] - o[bx]) * mirror];

    const V2 = [], V3 = [], kind = [];
    function addVertex(p3, k) {
        const q = to2(p3);
        for (let i = 0; i < V2.length; i++) {
            if (Math.abs(V2[i][0] - q[0]) <= snap && Math.abs(V2[i][1] - q[1]) <= snap &&
                Math.hypot(V2[i][0] - q[0], V2[i][1] - q[1]) <= snap) return i;
        }
        V2.push(q); V3.push(p3); kind.push(k);
        return V2.length - 1;
    }
    for (let k = 0; k < 3; k++) addVertex(T[k], "corner");
    if (V2.length < 3) return refuse("degenerate triangle");
    const areaT = triArea2(V2[0], V2[1], V2[2]);
    if (!(areaT > 0)) return refuse("degenerate triangle");

    const edges = [[0, 1], [1, 2], [2, 0]];
    for (const s of segs) {
        const a = addVertex(s.p0, "segment"), b = addVertex(s.p1, "segment");
        if (a !== b) edges.push([a, b]);
    }

    // ---- 3. proper crossings between edges (a manifold, non-self-intersecting B gives none; counted) -----------
    // Registering the crossing on both edges here is REDUNDANT on every fixture gated: step 4 re-finds it within
    // snap of both (sabotages A10/A10b, one or both registrations removed: 0 red in all three gates). It matters
    // only if the crossing snaps onto an existing vertex more than snap from one of the two edges -- no fixture
    // builds that. Kept because it is the correct split there and costs nothing; named so it is not read as tested.
    let crossings = 0;
    const onEdge = edges.map(() => []);
    const baseEdges = edges.length;
    for (let i = 0; i < baseEdges; i++) {
        for (let j = i + 1; j < baseEdges; j++) {
            const [a, b] = edges[i], [c, d] = edges[j];
            if (a === c || a === d || b === c || b === d) continue;
            const A = V2[a], B = V2[b], C = V2[c], D = V2[d];
            const lab = Math.hypot(B[0] - A[0], B[1] - A[1]), lcd = Math.hypot(D[0] - C[0], D[1] - C[1]);
            const dc = 2 * triArea2(A, B, C) / lab, dd = 2 * triArea2(A, B, D) / lab;
            const da = 2 * triArea2(C, D, A) / lcd, db = 2 * triArea2(C, D, B) / lcd;
            if (!((dc > snap && dd < -snap) || (dc < -snap && dd > snap))) continue;
            if (!((da > snap && db < -snap) || (da < -snap && db > snap))) continue;
            const t = da / (da - db);
            const pa = V3[a], pb = V3[b];
            const p3 = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
            const v = addVertex(p3, "crossing");
            onEdge[i].push(v); onEdge[j].push(v);
            crossings++;
        }
    }

    // ---- 4. every vertex lying on an edge's interior splits it (segment ends on triA's sides, T-junctions) -------
    for (let e = 0; e < edges.length; e++) {
        const [a, b] = edges[e];
        for (let v = 0; v < V2.length; v++) {
            if (v === a || v === b) continue;
            const { d, t } = segDist(V2[v], V2[a], V2[b]);
            if (d <= snap && t > 0 && t < 1) onEdge[e].push(v);
        }
    }
    const adj = V2.map(() => new Set());
    for (let e = 0; e < edges.length; e++) {
        const [a, b] = edges[e];
        const A = V2[a], dx = V2[b][0] - A[0], dy = V2[b][1] - A[1];
        const chain = [...new Set(onEdge[e])].map((v) => ({ v, t: (V2[v][0] - A[0]) * dx + (V2[v][1] - A[1]) * dy }))
            .sort((p, q) => p.t - q.t).map((p) => p.v);
        let prev = a;
        for (const v of [...chain, b]) {
            if (v !== prev) { adj[prev].add(v); adj[v].add(prev); }
            prev = v;
        }
    }

    // ---- 5. a vertex of degree 1 is a segment chain that stops inside triA: B's surface would cross the face it
    // sits in, so no face could be classified by one point. Refused, not pruned. --------------------------------
    for (let v = 0; v < V2.length; v++) if (adj[v].size === 1) return refuse("dangling");

    // ---- 6. faces: next(u->v) = v->w, w the neighbour of v clockwise-next after u; faces lie to the left --------
    const order = adj.map((s, v) => [...s].sort((p, q) =>
        Math.atan2(V2[p][1] - V2[v][1], V2[p][0] - V2[v][0]) - Math.atan2(V2[q][1] - V2[v][1], V2[q][0] - V2[v][0])));
    const used = new Set();
    const cycles = [];
    let halfEdges = 0;
    for (let u = 0; u < V2.length; u++) for (const v of order[u]) {
        halfEdges++;
        if (used.has(u + "," + v)) continue;
        const cyc = [];
        let a = u, b = v, guard = 0;
        while (!used.has(a + "," + b)) {
            used.add(a + "," + b);
            cyc.push(a);
            const nb = order[b], i = nb.indexOf(a);
            const w = nb[(i - 1 + nb.length) % nb.length];
            a = b; b = w;
            if (++guard > 4 * halfEdges + 16 * V2.length) return refuse("face walk");
        }
        if (a !== u || b !== v) return refuse("face walk");
        cycles.push({ vs: cyc, area: area2(cyc.map((i) => V2[i])) });
    }

    // components, so a hole is never assigned to a face of its own component
    const comp = V2.map((_, i) => i);
    const find = (i) => { while (comp[i] !== i) { comp[i] = comp[comp[i]]; i = comp[i]; } return i; };
    for (let v = 0; v < V2.length; v++) for (const w of adj[v]) comp[find(v)] = find(w);

    // Area tolerances are snap x perimeter: every vertex may sit up to snap from where exact arithmetic would put it
    // (a segment end on triA's side, a vertex absorbed into a straight run), and moving a polygon's vertices by d
    // moves its area by at most d x its perimeter. A tolerance relative to area alone refused a triangle whose
    // segment end lay 1e-10 off its side: outer cycle -0.024136561511 against triA 0.024136561575 (chain shot 6).
    const perim = (c) => c.vs.reduce((s, v, i) => { const w = c.vs[(i + 1) % c.vs.length];
        return s + Math.hypot(V2[w][0] - V2[v][0], V2[w][1] - V2[v][1]); }, 0);
    const tolA = snap * perim({ vs: [0, 1, 2] }) + AREA_REL * areaT;
    // A cycle is degenerate when it is thinner than the snap distance -- |area| <= snap x perimeter -- not when it
    // is small against triA: a spike tip grazing a wall face encloses a genuine loop of area ~1e-9 (measured, n=64).
    const thin = cycles.filter((c) => Math.abs(c.area) <= snap * perim(c));
    if (thin.length) return refuse("zero-area cycle", { thin: thin.length });
    const pos = cycles.filter((c) => c.area > 0);
    const neg = cycles.filter((c) => c.area < 0);
    // the outer face: the one negative cycle around triA's own boundary, of area -area(triA)
    const outerIdx = neg.findIndex((c) => c.vs.includes(0));
    if (outerIdx < 0 || Math.abs(neg[outerIdx].area + areaT) > tolA) return refuse("outer face");
    const holes = neg.filter((_, i) => i !== outerIdx);
    const faces = pos.map((c) => ({ ...c, comp: find(c.vs[0]), holes: [] }));
    for (const h of holes) {
        const hc = find(h.vs[0]), q = V2[h.vs[0]];
        let best = null;
        for (const f of faces) {
            if (f.comp === hc) continue;
            if (!pointInPoly(q, f.vs.map((i) => V2[i]))) continue;
            if (!best || f.area < best.area) best = f;
        }
        if (!best) return refuse("hole unassigned");
        best.holes.push(h);
    }
    let sum = 0;
    for (const f of faces) sum += f.area + f.holes.reduce((s, h) => s + h.area, 0);
    if (Math.abs(sum - areaT) > tolA) return refuse("face area sum", { sum, areaT });

    // ---- 7. triangulate each face (vendored three.js Earcut, holes supported), wound like triA ------------------
    // Vertices on triA's own straight sides (and on any straight run of segments) are collinear only to rounding,
    // and Earcut cuts ears between them: slivers of area ~1e-17..1e-21, measured on a twelve-blast chain, whose
    // normals are noise to everything downstream. So each ring is SIMPLIFIED first -- a vertex goes if it, and
    // every vertex already absorbed beside it, lies within snap of the segment joining its surviving neighbours --
    // Earcut sees only the corners, and each absorbed run is put back by fanning the one triangle that owns that
    // edge from its opposite vertex. Every vertex comes back, so the face still meets its neighbours edge for edge.
    const out = [];
    let absorbedTotal = 0;
    for (const f of faces) {
        const want = f.area + f.holes.reduce((s, h) => s + h.area, 0);
        const absorbed = new Map();          // "p,q" (a surviving ring edge) -> the vertices strictly between, in order
        const rings = [];
        for (const vs of [f.vs, ...f.holes.map((h) => h.vs)]) {
            const n = vs.length, alive = vs.map(() => true);
            const nx = vs.map((_, i) => (i + 1) % n), pv = vs.map((_, i) => (i - 1 + n) % n);
            const abs = vs.map(() => []);    // abs[i]: vertices absorbed between node i and nx[i]
            let live = n, changed = true;
            while (changed && live > 3) {
                changed = false;
                for (let i = 0; i < n && live > 3; i++) {
                    if (!alive[i]) continue;
                    const a = pv[i], b = nx[i];
                    const run = [...abs[a], vs[i], ...abs[i]];
                    if (!run.every((v) => { const r = segDist(V2[v], V2[vs[a]], V2[vs[b]]); return r.d <= snap && r.t > 0 && r.t < 1; })) continue;
                    alive[i] = false; live--; changed = true;
                    abs[a] = run; nx[a] = b; pv[b] = a;
                }
            }
            if (live < 3) return refuse("thin face");
            const ring = [];
            for (let i = 0; i < n; i++) if (alive[i]) {
                ring.push(vs[i]);
                if (abs[i].length) { absorbed.set(vs[i] + "," + vs[nx[i]], abs[i]); absorbedTotal += abs[i].length; }
            }
            rings.push(ring);
        }
        const flat = rings.flat();
        const idx = ShapeUtils.triangulateShape(rings[0].map((i) => new Vector2(V2[i][0], V2[i][1])),
            rings.slice(1).map((r) => r.map((i) => new Vector2(V2[i][0], V2[i][1]))));
        let T3 = [];
        let got = 0;
        for (const [i, j, k] of idx) {
            const a = flat[i];
            let b = flat[j], c = flat[k];
            let ar = triArea2(V2[a], V2[b], V2[c]);
            if (ar < 0) { [b, c] = [c, b]; ar = -ar; }
            if (ar === 0) return refuse("earcut", { zeroArea: true });
            got += ar;
            T3.push([a, b, c]);
        }
        const tolF = snap * (perim(f) + f.holes.reduce((s, h) => s + perim(h), 0)) + AREA_REL * areaT;
        if (T3.length === 0 || Math.abs(got - want) > tolF) return refuse("earcut", { got, want });
        // put each absorbed run back: the triangle holding directed ring edge p->q becomes a fan from its third vertex
        for (const [key, run] of absorbed) {
            const [p, q] = key.split(",").map(Number);
            let hit = -1, e = -1;
            for (let ti = 0; ti < T3.length && hit < 0; ti++) for (let k = 0; k < 3; k++) {
                if (T3[ti][k] === p && T3[ti][(k + 1) % 3] === q) { hit = ti; e = k; break; }
            }
            if (hit < 0) return refuse("lost edge");
            const r = T3[hit][(e + 2) % 3], chain = [p, ...run, q], fan = [];
            for (let k = 0; k + 1 < chain.length; k++) fan.push([chain[k], chain[k + 1], r]);
            T3.splice(hit, 1, ...fan);
        }
        const usedV = new Set(T3.flat());
        for (const v of [f.vs, ...f.holes.map((h) => h.vs)].flat()) if (!usedV.has(v)) return refuse("dropped vertex");
        let best = 0, bestA = -Infinity;
        for (let ti = 0; ti < T3.length; ti++) {
            const ar = triArea2(V2[T3[ti][0]], V2[T3[ti][1]], V2[T3[ti][2]]);
            if (ar > bestA) { bestA = ar; best = ti; }
        }
        const tris = T3.map(([a, b, c]) => [V3[a], V3[b], V3[c]]);
        const t = tris[best];
        const sample = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
        out.push({ tris, sample, area: want, holes: f.holes.length });
    }
    return {
        status: "ok",
        faces: out,
        stats: { segments: segs.length, vertices: V2.length, crossings, pointContacts, absorbed: absorbedTotal,
                 faceCount: out.length, holeCount: holes.length },
    };
}
