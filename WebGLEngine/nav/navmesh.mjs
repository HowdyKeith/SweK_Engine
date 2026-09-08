// WebGLEngine/nav/navmesh.mjs -- v4543
//
// *** A CONVEX-POLYGON NAVMESH, BUILT TO ANSWER A QUESTION nav/funnel.mjs ASKED AND COULD NOT SETTLE. ***
//
// funnel-selfcheck.mjs ends with "unchecked here: a NAVMESH", and its section 4 is the reason the question
// mattered. Measured there, on a wall with one gap: the grid A* staircase is 318.39 m and never enters a
// wall; the funnel pulled through the SAME grid corridor is 302.20 m and enters one at 18 of 616 samples;
// and insetting the portals until it is as safe as the staircase costs 319.59 m -- LONGER than the staircase
// it was meant to improve. Its verdict was "string-pulling is a real gain on open ground and a net LOSS in
// tight geometry", and the stated reason was that a grid corridor has no clearance of its own, so the whole
// saving is a safety margin the grid held by accident.
//
// A navmesh answers that by ERODING THE WALKABLE SET BY THE AGENT RADIUS BEFORE the polygons exist, so the
// clearance is a property of the mesh rather than something a caller adds back afterwards. On the same
// fixture, at the same radius the grid funnel needed to be safe (r = 1.9):
//
//     grid staircase             318.39 m    0 of 724 in wall
//     grid funnel, inset to safe 319.59 m    0 of 706 in wall
//     THIS FILE                  297.42 m    0 of 605 in wall, TRUE minimum clearance 2.687
//
// 6.9% shorter than the safest grid path, at the same zero wall samples, and within 0.27% of the analytic
// optimum for an agent of that radius. The clearance is measured against the wall's real faces rather than
// against the field that produced the erosion -- which is the only reason the next paragraph exists. Every
// number here is re-derived by tools/ship/navmesh-selfcheck.mjs on each run at supersample 4; they are
// printed in this header so a reader knows what to expect, not so anything trusts them.
//
// ---- THE DEFECT THAT MEASUREMENT FOUND, AND A CHAMFER FIELD WOULD HAVE HIDDEN --------------------------------
//
// The first draft eroded with the chamfer 2/3 distance field Recast uses. A chamfer costs a diagonal step 3
// where the truth is 2*sqrt(2) = 2.828, so it OVERSTATES diagonal distance by 6% and keeps cells the erosion
// should have removed. Grading it by "does the path enter a wall" said it was fine -- 0 of 599 -- because
// that question is much weaker than the one the mesh is promising. Grading it by TRUE MINIMUM CLEARANCE
// caught it at once:
//
//     asked r = 1    delivered 0.708   (short by 0.292, and 0.708 is sqrt(2)/2)
//     asked r = 3    delivered 2.829   (short by 0.171, and 2.829 is 2*sqrt(2))
//
// Both shortfalls are exactly the diagonal the chamfer mis-prices. An exact Euclidean transform
// (Felzenszwalb-Huttenlocher, lower envelope of parabolas, O(n) per axis) replaces it and every row then
// honours its promise.
//
// *** WHAT IS AND IS NOT EXACT, BECAUSE AN EARLIER DRAFT OF THIS COMMENT CLAIMED MORE THAN THE CODE DOES. ***
// The transform is exact CENTRE TO CENTRE. The distance from a point to a blocked cell's SQUARE is a
// different transform -- min over j of max(|i-j| - 0.5, 0)^2 summed per axis -- and that cost is not a
// parabola in j, so the lower-envelope trick does not compute it and this file does not pretend to. What is
// used instead is a BOUND in the safe direction: a cell's square lies within its circumradius sqrt(2)/2 of
// its centre, so subtracting that from the centre-to-centre distance can only understate clearance, and
// requiring r + sqrt(2)/2 before keeping a cell can only overstate what the agent needs. Measured cost of
// being conservative twice over: the mesh delivers about r + 1 where r was asked, and the path is 0.46%
// longer than the analytic optimum. That is the price, it is named, and it is paid in the safe direction.
//
// ---- PROVENANCE -----------------------------------------------------------------------------------------------
//
// The pipeline is Recast's (Mikko Mononen, zlib): mark the walkable surface, erode it by the agent radius,
// partition it into regions, turn regions into convex polygons, then A* over polygon adjacency and pull the
// string with Detour's funnel. What is taken is the ORDER OF OPERATIONS and the reason for it -- eroding
// before partitioning is the whole point, and it is the step a grid pathfinder cannot express. No code is
// taken from Recast, from navcat (the pure-JS Recast+Detour port named as the reference for this round), or
// from three-pathfinding; none of the three was read while writing this, and the funnel itself is already in
// this tree as nav/funnel.mjs, which this file imports rather than restates.
//
// TWO STAGES OF RECAST ARE DELIBERATELY NOT BUILT, AND SAYING WHICH IS THE POINT. Recast partitions with a
// watershed over the distance field and then traces and simplifies region contours before merging triangles
// into convex polygons. This file partitions into MAXIMAL RECTANGLES instead -- a monotone row sweep, which
// Recast also ships as rcBuildRegionsMonotone -- and rectangles are convex already, so no contour tracing
// and no convex merge is needed. That is a smaller mesh stage, and the reason it is enough was MEASURED
// before it was built rather than assumed: on the obstacle fixture the sweep produces NINE polygons for
// 251,685 cells, and the funnel over them lands on the analytic optimum to 0.00 m at r = 0. Path quality
// comes from the PORTALS BEING REAL EDGES, not from the polygons being few or from their being contours.
// What the missing stages would buy is polygon count on curved and diagonal boundaries, where a row sweep
// makes a staircase of thin rectangles; that costs memory and A* nodes, and it is measured in the gate
// rather than guessed at here.
"use strict";

import { triarea2, funnel, pathLength, crossesAllPortals } from "./funnel.mjs";

const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Half the diagonal of one cell: the radius of the disc that contains a cell's square. */
export const HALF_DIAG = Math.SQRT2 / 2;

/**
 * The 4-neighbour connection mask, one nibble per cell, from the SAME step rule the shipped A* applies.
 *
 * *** DERIVED FROM worker/botPathfinder.worker.js RATHER THAN INVENTED, because a navmesh that disagreed
 * with the solver about what is walkable would be answering a different question. *** That worker admits a
 * step when the height difference is within [-maxStepDown, +maxStepUp] and rejects nothing else; there is no
 * occupancy flag anywhere in it, and a wall blocks by being too tall to climb rather than by being marked.
 * The mask here is that rule and nothing more.
 */
export function connectivity(hm, { stride, maxStepUp = 3, maxStepDown = 6 } = {}) {
    const rows = Math.floor(hm.length / stride);
    const conn = new Uint8Array(stride * rows);
    const H = (x, z) => (x < 0 || z < 0 || x >= stride || z >= rows) ? -Infinity : hm[z * stride + x];
    for (let z = 0; z < rows; z++) for (let x = 0; x < stride; x++) {
        const a = H(x, z);
        if (!Number.isFinite(a)) continue;
        let m = 0;
        for (let d = 0; d < 4; d++) {
            const b = H(x + DIR[d][0], z + DIR[d][1]);
            if (!Number.isFinite(b)) continue;
            const dh = b - a;
            if (dh <= maxStepUp && dh >= -maxStepDown) m |= 1 << d;
        }
        conn[z * stride + x] = m;
    }
    return { conn, stride, rows };
}

/** Flood the connection graph from a seed cell. Returns the component as a 0/1 mask. */
export function component({ conn, stride, rows }, seedX, seedZ, allow = null) {
    const out = new Uint8Array(stride * rows);
    const s = seedZ * stride + seedX;
    if (seedX < 0 || seedZ < 0 || seedX >= stride || seedZ >= rows) return out;
    if (allow && !allow[s]) return out;
    const st = [s]; out[s] = 1;
    while (st.length) {
        const i = st.pop(), x = i % stride, z = (i / stride) | 0, m = conn[i];
        for (let d = 0; d < 4; d++) {
            if (!(m & (1 << d))) continue;
            const nx = x + DIR[d][0], nz = z + DIR[d][1];
            if (nx < 0 || nz < 0 || nx >= stride || nz >= rows) continue;
            const j = nz * stride + nx;
            if (out[j] || (allow && !allow[j])) continue;
            out[j] = 1; st.push(j);
        }
    }
    return out;
}

/** One-dimensional squared-distance transform: the lower envelope of parabolas. Felzenszwalb-Huttenlocher. */
function edt1d(f, n, out, v, zz) {
    const INF = 1e12;
    let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
    for (let q = 1; q < n; q++) {
        let s;
        for (;;) {
            const p = v[k];
            s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
            if (s <= zz[k] && k > 0) k--; else break;
        }
        k++; v[k] = q; zz[k] = s; zz[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
        while (zz[k + 1] < q) k++;
        const d = q - v[k];
        out[q] = d * d + f[v[k]];
    }
}

/**
 * For every cell, a LOWER BOUND on the clearance of the worst point inside it, in cell units.
 *
 * *** THE BOUND IS LOOSE BY sqrt(2)/supersample, AND THAT IS THE WHOLE REASON THIS PARAMETER EXISTS. ***
 * The transform is exact centre to centre. Two things then stand between a centre-to-centre distance and the
 * quantity an erosion actually needs, which is "how close does the WORST POINT of this cell come to the
 * blocked REGION":
 *
 *   1. a blocked cell is a square, not a point, so its nearest face is up to one circumradius nearer than
 *      its centre;
 *   2. the kept cell is a square too, so its worst point is up to one circumradius nearer than its centre.
 *
 * Each is bounded by the circumradius sqrt(2)/2 of one sampling cell, so the total slack is sqrt(2) sampling
 * cells -- and sampling the field s times finer divides it by s while leaving the mesh's own resolution
 * alone. MEASURED, on a 6-unit gap an agent of radius 2 fits through with 2.00 of corridor to spare:
 * s = 1 refuses it by 0.414 cells, s = 4 by 0.104, s = 8 by 0.052. It converges to the knife edge and never
 * crosses it, which is what a conservative test should do on a case whose true margin is exactly zero -- and
 * a test that DID pass that case would be reporting something it had not established.
 *
 * The returned value already has the slack subtracted, so a caller keeps a cell when it is >= radius.
 */
export function clearanceField(inside, stride, rows, { supersample = 1 } = {}) {
    const s = Math.max(1, Math.round(supersample));
    const FW = stride * s, FH = rows * s, INF = 1e12;
    const sq = new Float64Array(FW * FH);
    for (let z = 0; z < FH; z++) for (let x = 0; x < FW; x++)
        sq[z * FW + x] = inside[((z / s) | 0) * stride + ((x / s) | 0)] ? INF : 0;
    const len = Math.max(FW, FH);
    const tmp = new Float64Array(len), col = new Float64Array(len);
    const v = new Int32Array(len), zz = new Float64Array(len + 1);
    for (let z = 0; z < FH; z++) {
        for (let x = 0; x < FW; x++) tmp[x] = sq[z * FW + x];
        edt1d(tmp, FW, col, v, zz);
        for (let x = 0; x < FW; x++) sq[z * FW + x] = col[x];
    }
    for (let x = 0; x < FW; x++) {
        for (let z = 0; z < FH; z++) tmp[z] = sq[z * FW + x];
        edt1d(tmp, FH, col, v, zz);
        for (let z = 0; z < FH; z++) sq[z * FW + x] = col[z];
    }
    // fine distances are in FINE cells; bring them back to mesh cells, take the worst over each mesh cell,
    // and pay the two circumradii once, at the FINE resolution.
    const slack = Math.SQRT2 / s;
    const out = new Float64Array(stride * rows).fill(Infinity);
    for (let z = 0; z < FH; z++) for (let x = 0; x < FW; x++) {
        const i = ((z / s) | 0) * stride + ((x / s) | 0);
        const d = Math.sqrt(sq[z * FW + x]) / s;
        if (d < out[i]) out[i] = d;
    }
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, out[i] - slack);
    return out;
}

/**
 * Maximal-rectangle partition of a cell mask: a monotone row sweep, and every output is convex by shape.
 *
 * A row's maximal runs are found, and a run continues the rectangle above it only when the x-range is
 * IDENTICAL. Anything else closes the rectangle and opens a new one, which is what keeps every output a
 * rectangle rather than a staircase.
 */
export function rectangles(mask, stride, rows, conn = null) {
    // *** A RUN BREAKS WHERE THE STEP IS NOT MUTUAL, AND THIS IS A CORRECTNESS FIX RATHER THAN A REFINEMENT.
    // *** maxStepUp and maxStepDown are DIFFERENT numbers -- 3 and 6 in the shipped worker -- so a five-unit
    // ledge can be walked off and not climbed back. Without this test the row sweep put both sides of such a
    // ledge in ONE rectangle, and a rectangle is a polygon the funnel crosses in a straight line: measured,
    // the mesh returned a 110.00 m path UP a cliff, over one polygon, with nothing to object. Reachability
    // from the seed had hidden it, because a mesh grown downhill contains both levels and answers queries
    // between them.
    const mutual = (i, j, d) => !conn || (((conn[i] >> d) & 1) && ((conn[j] >> ((d + 2) % 4)) & 1));
    const out = [], open = new Map();
    for (let z = 0; z < rows; z++) {
        const cur = new Map();
        let x = 0;
        while (x < stride) {
            if (!mask[z * stride + x]) { x++; continue; }
            const x0 = x;
            x++;
            while (x < stride && mask[z * stride + x] && mutual(z * stride + x - 1, z * stride + x, 0)) x++;
            cur.set(x0 + "," + (x - 1), [x0, x - 1]);
        }
        for (const [k, [x0, x1]] of cur) {
            const p = open.get(k);
            let joins = !!p;
            if (joins) for (let q = x0; q <= x1; q++)
                if (!mutual((z - 1) * stride + q, z * stride + q, 1)) { joins = false; break; }
            if (joins) p.z1 = z;
            else { if (p) { out.push(p); open.delete(k); } open.set(k, { x0, x1, z0: z, z1: z }); }
        }
        for (const [k, v] of [...open]) if (!cur.has(k)) { out.push(v); open.delete(k); }
    }
    for (const v of open.values()) out.push(v);
    return out;
}

/**
 * Build the navmesh for the component containing (seedX, seedZ).
 *
 * *** THE OBSTACLE SET IS "NOT IN THIS COMPONENT", WHICH IS THE ONLY DEFINITION A HEIGHTMAP SUPPORTS. ***
 * A heightmap cannot tell a vertical wall from a very steep slope: the wall's TOP is a perfectly flat,
 * perfectly walkable surface, and a per-cell slope test calls it walkable and then erodes the good ground
 * beside it for having a tall neighbour. Recast does not have this problem because it carries real spans and
 * a wall's side is not a span at all. So the erosion here measures distance to whatever the agent cannot
 * REACH, taken from the connection graph, and a magic height threshold appears nowhere in this file.
 */
export function buildNavmesh(hm, {
    stride, seedX, seedZ, radius = 0, maxStepUp = 3, maxStepDown = 6,
    cellSize = 1, originX = 0, originZ = 0, supersample = 1,
} = {}) {
    const C = connectivity(hm, { stride, maxStepUp, maxStepDown });
    const { rows } = C;
    const reach = component(C, seedX, seedZ);
    const clear = clearanceField(reach, stride, rows, { supersample });
    const need = radius / cellSize;
    const keep = new Uint8Array(stride * rows);
    for (let i = 0; i < keep.length; i++) if (reach[i] && clear[i] >= need) keep[i] = 1;
    const kept = component(C, seedX, seedZ, keep);
    const rects = rectangles(kept, stride, rows, C.conn);
    const wx = (cx) => originX + cx * cellSize;
    const wz = (cz) => originZ + cz * cellSize;
    const h = cellSize / 2;
    // adjacency, with the shared edge as a real segment; cell i spans [w(i) - h, w(i) + h]
    // *** PORTALS CARRY A DIRECTION EACH WAY, AND ARE SPLIT WHERE THAT CHANGES ALONG THE EDGE. *** A shared
    // boundary is not uniformly traversable just because its two rectangles touch: a ledge can run along part
    // of it. Each shared span is therefore cut into maximal runs that agree about which ways are passable,
    // and one portal is emitted per run rather than one per pair.
    const adj = rects.map(() => []);
    const bitAt = (ax, az, bx, bz, d) => {
        const i = az * stride + ax, j = bz * stride + bx;
        return { f: (C.conn[i] >> d) & 1, b: (C.conn[j] >> ((d + 2) % 4)) & 1 };
    };
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const A = rects[i], B = rects[j];
        let axis = -1, lo = 0, hi = -1, line = 0, aFirst = false;
        if (A.z1 + 1 === B.z0 || B.z1 + 1 === A.z0) {
            axis = 1; aFirst = A.z1 + 1 === B.z0;
            line = (aFirst ? wz(A.z1) : wz(B.z1)) + h;
            lo = Math.max(A.x0, B.x0); hi = Math.min(A.x1, B.x1);
        } else if (A.x1 + 1 === B.x0 || B.x1 + 1 === A.x0) {
            axis = 0; aFirst = A.x1 + 1 === B.x0;
            line = (aFirst ? wx(A.x1) : wx(B.x1)) + h;
            lo = Math.max(A.z0, B.z0); hi = Math.min(A.z1, B.z1);
        }
        if (axis < 0 || hi < lo) continue;
        const lowRect = aFirst ? A : B, highRect = aFirst ? B : A;   // low/high in the sweep axis
        const passAt = (t) => {
            const d = axis === 1 ? 1 : 0;
            const [ax, az] = axis === 1 ? [t, lowRect.z1] : [lowRect.x1, t];
            const [bx, bz] = axis === 1 ? [t, highRect.z0] : [highRect.x0, t];
            const { f, b } = bitAt(ax, az, bx, bz, d);
            return aFirst ? { fwd: f, bwd: b } : { fwd: b, bwd: f };   // fwd is always i -> j
        };
        let t = lo;
        while (t <= hi) {
            const p0 = passAt(t);
            if (!p0.fwd && !p0.bwd) { t++; continue; }
            let e = t;
            while (e + 1 <= hi) { const p = passAt(e + 1); if (p.fwd !== p0.fwd || p.bwd !== p0.bwd) break; e++; }
            const seg = axis === 1
                ? [{ x: wx(t) - h, z: line }, { x: wx(e) + h, z: line }]
                : [{ x: line, z: wz(t) - h }, { x: line, z: wz(e) + h }];
            if (p0.fwd) adj[i].push({ to: j, seg });
            if (p0.bwd) adj[j].push({ to: i, seg });
            t = e + 1;
        }
    }
    const centre = (R) => ({ x: (wx(R.x0) + wx(R.x1)) / 2, z: (wz(R.z0) + wz(R.z1)) / 2 });
    return {
        rects, adj, centre, stride, rows, cellSize, originX, originZ, radius, supersample,
        slack: Math.SQRT2 / Math.max(1, Math.round(supersample)),
        cells: kept.reduce((a, b) => a + b, 0),
        clear, reach, kept,
        polyAt(x, z) {
            const cx = Math.round((x - originX) / cellSize), cz = Math.round((z - originZ) / cellSize);
            for (let i = 0; i < rects.length; i++) {
                const R = rects[i];
                if (cx >= R.x0 && cx <= R.x1 && cz >= R.z0 && cz <= R.z1) return i;
            }
            return -1;
        },
    };
}

/** A* over polygon adjacency, entering each polygon at the midpoint of the portal that reached it. */
export function corridor(mesh, s, g) {
    const si = mesh.polyAt(s.x, s.z), gi = mesh.polyAt(g.x, g.z);
    if (si < 0 || gi < 0) return null;
    if (si === gi) return { chain: [], si, gi };
    const mid = (seg) => ({ x: (seg[0].x + seg[1].x) / 2, z: (seg[0].z + seg[1].z) / 2 });
    const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const gS = new Map([[si, 0]]), prev = new Map(), pt = new Map([[si, s]]);
    const open = [[0, si]], done = new Set();
    while (open.length) {
        open.sort((a, b) => a[0] - b[0]);
        const [, i] = open.shift();
        if (done.has(i)) continue;
        done.add(i);
        if (i === gi) break;
        for (const e of mesh.adj[i]) {
            if (done.has(e.to)) continue;
            const m = mid(e.seg), ng = gS.get(i) + D(pt.get(i), m);
            if (gS.has(e.to) && gS.get(e.to) <= ng) continue;
            gS.set(e.to, ng); prev.set(e.to, { from: i, seg: e.seg }); pt.set(e.to, m);
            open.push([ng + D(m, g), e.to]);
        }
    }
    if (!gS.has(gi)) return null;
    const chain = [];
    for (let c = gi; c !== si;) { const p = prev.get(c); chain.push({ seg: p.seg, from: p.from, to: c }); c = p.from; }
    chain.reverse();
    return { chain, si, gi };
}

/**
 * Portals for a corridor, oriented left/right the way nav/funnel.mjs's sidedness tests want them.
 *
 * *** ORIENTED FROM THE TWO POLYGONS THE EDGE JOINS, NEVER FROM THE PATH. *** Detour gets left and right for
 * free out of the polygon winding. Deriving them instead from the neighbouring portals' midpoints -- which
 * is what the first draft did -- flips the pair whenever three portals are close to collinear, and one
 * flipped portal sends the funnel to the far end of the corridor. Measured on the obstacle fixture against
 * an optimum of 296.62: 930.87 m when this bug was first found, on the draft that eroded with a chamfer
 * field, and 562.49 m -- 89% over -- on the module as it now stands. The gate asserts the RATIO rather than
 * either metre count, because the erosion has changed twice since the first reading and a number carried
 * forward from a build that no longer exists is a memory rather than a measurement. Throughout, and this is
 * the part worth keeping: `crossesAllPortals` reported 0 MISSED, because a path that zigzags across its
 * corridor really does cross every portal in it.
 */
export function portalsFor(mesh, s, g, chain) {
    const out = [{ left: { ...s }, right: { ...s } }];
    for (const { seg, from, to } of chain) {
        const a = mesh.centre(mesh.rects[from]), b = mesh.centre(mesh.rects[to]);
        out.push(triarea2(a, b, seg[0]) < 0 ? { left: seg[0], right: seg[1] } : { left: seg[1], right: seg[0] });
    }
    out.push({ left: { ...g }, right: { ...g } });
    return out;
}

/** Plan a path: A* over polygons, then the funnel. Returns null when the agent does not fit. */
export function planPath(mesh, s, g) {
    const c = corridor(mesh, s, g);
    if (!c) return null;
    const portals = portalsFor(mesh, s, g, c.chain);
    const points = funnel(portals);
    return { points, portals, polys: c.chain.length + 1, length: pathLength(points), corridor: c };
}

/** Minimum straight-line width of the corridor, in world units: the narrowest portal the path must cross. */
export function narrowest(portals) {
    let w = Infinity;
    for (let i = 1; i + 1 < portals.length; i++) {
        const P = portals[i];
        w = Math.min(w, Math.hypot(P.right.x - P.left.x, P.right.z - P.left.z));
    }
    return portals.length > 2 ? w : Infinity;
}

export function reportLines(mesh, plan) {
    const out = ["[navmesh] " + mesh.rects.length + " convex polygons over " + mesh.cells + " cells" +
                 ", agent radius " + mesh.radius];
    if (plan) {
        out.push("  corridor        " + plan.polys + " polygons, " + (plan.portals.length - 2) + " portals");
        out.push("  path            " + plan.length.toFixed(2) + " over " + plan.points.length + " corners");
        out.push("  narrowest gate  " + narrowest(plan.portals).toFixed(2));
        out.push("  portals crossed " + JSON.stringify(crossesAllPortals(plan.points, plan.portals)));
    }
    return out;
}
