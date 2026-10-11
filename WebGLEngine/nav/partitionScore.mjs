// WebGLEngine/nav/partitionScore.mjs -- v4536
//
// *** THE BACKLOG ASKED FOR A BETTER PARTITION AND NOTHING COULD HAVE TOLD A BETTER ONE FROM A WORSE ONE. ***
//
// Backlog item "navmesh-recast" piece (1) asks for Recast's watershed regions plus contour tracing and
// simplification, to replace the monotone row sweep in nav/navmesh.mjs. Its stated cost is "a 45-degree wall
// becomes 737 thin rectangles where a contour mesh would give a handful", and its stated prize is memory and
// A* nodes. Three of those four claims did not survive being measured, and the fourth is the one that matters:
//
//   THE ROW SWEEP IS ALREADY OPTIMAL. Lipski/Ohtsuki gives the minimum number of rectangles in a partition of
//   a rectilinear region as N - L + 1 - H, for N reflex vertices, L maximum independent reflex-to-reflex
//   chords and H holes. On the diagonal fixture that is 738 - 0 + 1 - 2 = 737 -- exactly what rectangles()
//   emits. And a union of axis-aligned unit cells is convex if and only if it is a rectangle, so NO
//   partitioner that keeps its polygons on the cell lattice can beat 737. The 737 is not a staircase artefact
//   to be tidied away; it is the floor. Everything below it has to be bought by leaving the lattice, which is
//   exactly what puts the round's own stated source of path quality -- portals being real, exactly shared
//   edges -- at risk. minRectPartition() below re-derives that floor from the mask on every run, so the
//   number is a computation rather than a literal somebody remembered.
//
//   THE PRIZE IS NOT A* NODES. Measured over meshes from 737 to 11,242 polygons, planPath stays between 1 and
//   2 ms; the A* is not what polygon count costs. What it costs is the adjacency build, quadratically:
//   14.5 ms of a 119 ms build at 737 polygons and 1,064 ms of 1,152 ms at 11,242.
//
//   AND ON SHIPPING GEOMETRY IT COSTS NOTHING AT ALL. The one shipping caller decomposes its snapshot into
//   THREE rectangles. The 737 exists on one 512-square gate fixture and nowhere else.
//
// ---- WHAT THIS MODULE IS ---------------------------------------------------------------------------------
//
// A partition-agnostic scorer. It takes a LABELLING -- an Int32Array with -1 outside and a region id inside --
// and never asks what produced it, so the row sweep, a monotone sweep and a contour mesh are all scored by the
// same code on the same fixture in the same run. That is the thing the tree did not have, and its absence was
// measurable rather than arguable: deleting the vertical mutual-step test from the row sweep left EVERY nav
// gate green, so the property the module's longest comment defends was graded on one axis out of two.
//
// ---- AND ONE INSTRUMENT THAT IS NOT A SCORE --------------------------------------------------------------
//
// *** crossesAllPortals CANNOT SEE THE FAILURE A CONTOUR MESH INTRODUCES, AND THIS IS MEASURED. *** It asks
// whether the path crosses each portal segment. It never asks whether the path stays INSIDE the polygons. Feed
// it a portal one cell longer than the true shared span -- a T-junction, which contour tracing produces
// routinely and a row sweep cannot -- and the funnel cuts the corner: 91 of 427 samples land outside the mesh
// and crossesAllPortals reports 0 missed of 1. pathInMesh() below is the missing half, and it is written
// against RINGS rather than rectangles so that it still works on the polygons it exists to grade.
"use strict";

/** A ring is a closed list of world-space {x,z} vertices in consistent winding. Rectangles become rings. */
export function ringsOfRects(mesh) {
    const h = mesh.cellSize / 2;
    const wx = (cx) => mesh.originX + cx * mesh.cellSize, wz = (cz) => mesh.originZ + cz * mesh.cellSize;
    return mesh.rects.map((R) => [
        { x: wx(R.x0) - h, z: wz(R.z0) - h }, { x: wx(R.x1) + h, z: wz(R.z0) - h },
        { x: wx(R.x1) + h, z: wz(R.z1) + h }, { x: wx(R.x0) - h, z: wz(R.z1) + h },
    ]);
}

/** Point in a convex ring, inclusive of the boundary. Winding-agnostic: all cross products agree in sign. */
export function inRing(ring, p, eps = 1e-9) {
    let neg = false, pos = false;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const c = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
        if (c < -eps) neg = true; else if (c > eps) pos = true;
        if (neg && pos) return false;
    }
    return true;
}

/**
 * How much of a path lies outside the union of the given rings.
 *
 * *** THIS IS THE CHECK crossesAllPortals IS NOT. *** It samples rather than reasons, so it cannot prove
 * containment -- but it FAILS on the two cases the portal test passes: a reflex vertex in a polygon, and a
 * portal longer than the span it claims. `perUnit` is samples per world unit; the count is what gets asserted
 * and the offending sample is returned so a red row can say WHERE rather than only how many.
 */
export function pathInMesh(pts, rings, { perUnit = 40 } = {}) {
    let outside = 0, total = 0, worst = null;
    for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * perUnit));
        for (let s = 0; s <= n; s++) {
            const p = { x: a.x + (b.x - a.x) * s / n, z: a.z + (b.z - a.z) * s / n };
            total++;
            let hit = false;
            for (let r = 0; r < rings.length && !hit; r++) hit = inRing(rings[r], p);
            if (!hit) { outside++; if (!worst) worst = p; }
        }
    }
    return { outside, total, worst };
}

// =============================================================================================================
// THE LABELLING, AND THE THREE THINGS WORTH ASKING OF ONE
// =============================================================================================================

/** cell -> polygon index, -1 outside. Derived from a rect mesh; a contour mesh would produce its own. */
export function labelOfRects(mesh) {
    const lab = new Int32Array(mesh.stride * mesh.rows).fill(-1);
    for (let i = 0; i < mesh.rects.length; i++) {
        const R = mesh.rects[i];
        for (let z = R.z0; z <= R.z1; z++) for (let x = R.x0; x <= R.x1; x++) lab[z * mesh.stride + x] = i;
    }
    return lab;
}

export const regionCount = (lab) => { const s = new Set(); for (let i = 0; i < lab.length; i++) if (lab[i] >= 0) s.add(lab[i]); return s.size; };

/**
 * Same-region cell pairs the agent cannot cross BOTH ways -- the property the row sweep's `mutual` test buys.
 *
 * *** THIS IS THE ROUND'S REASON FOR EXISTING. *** maxStepUp and maxStepDown are different numbers, so a ledge
 * can be walked off and not climbed back. A polygon is something the funnel crosses in a straight line, so a
 * polygon spanning such a ledge is a claim that the ledge can be walked in both directions. Measured before
 * the row sweep's test existed, that returned a 110 m path UP a cliff. A watershed over the distance field
 * cannot restate this property: on the ledge fixture the field takes ONE distinct value across all 16,384
 * cells -- it is blind to the cliff, not approximately but completely -- because a cliff is a fact about the
 * connectivity graph and the field measures distance to unreachable ground.
 */
export function mutualViolations(lab, conn, stride, rows) {
    let bad = 0;
    const mutual = (i, j, d) => ((conn[i] >> d) & 1) && ((conn[j] >> ((d + 2) % 4)) & 1);
    for (let z = 0; z < rows; z++) for (let x = 0; x < stride; x++) {
        const i = z * stride + x;
        if (lab[i] < 0) continue;
        if (x + 1 < stride && lab[i + 1] === lab[i] && !mutual(i, i + 1, 0)) bad++;
        if (z + 1 < rows && lab[i + stride] === lab[i] && !mutual(i, i + stride, 1)) bad++;
    }
    return bad;
}

/** Directed region-to-region links and the unit boundary edges they are cut from. */
export function boundaryStats(lab, conn, stride, rows) {
    let edges = 0, directed = 0;
    const pairs = new Set();
    for (let z = 0; z < rows; z++) for (let x = 0; x < stride; x++) {
        const i = z * stride + x;
        if (lab[i] < 0) continue;
        for (const [dx, dz, d] of [[1, 0, 0], [0, 1, 1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx >= stride || nz >= rows) continue;
            const j = nz * stride + nx;
            if (lab[j] < 0 || lab[j] === lab[i]) continue;
            edges++;
            pairs.add(lab[i] < lab[j] ? lab[i] + ":" + lab[j] : lab[j] + ":" + lab[i]);
            if ((conn[i] >> d) & 1) directed++;
            if ((conn[j] >> ((d + 2) % 4)) & 1) directed++;
        }
    }
    return { edges, directed, pairs: pairs.size };
}

// =============================================================================================================
// THE OPTIMALITY FLOOR: N - L + 1 - H
// =============================================================================================================

/**
 * The minimum number of rectangles any partition of `mask` can use (Lipski/Ohtsuki), re-derived from the mask.
 *
 * A lattice corner is REFLEX when exactly three of its four surrounding cells are inside. A CHORD joins two
 * reflex corners along a grid line whose whole interior stays inside. Chords that cross cannot both be used,
 * so the usable set is a maximum independent set in the bipartite crossing graph of horizontal against
 * vertical chords -- which by Koenig is (chords - maximum matching). H is the number of complement components
 * the border flood cannot reach.
 *
 * *** THIS IS A CONTROL AND NOT A FIXTURE. *** It is computed from the SAME mask the mesh was built from and
 * compared against the count the mesh produced, so it goes red the moment rectangles() stops being optimal --
 * and it is the row that says a rectangle-merge pass over the sweep's output cannot buy anything at all.
 */
export function minRectPartition(mask, stride, rows) {
    const at = (x, z) => (x < 0 || z < 0 || x >= stride || z >= rows) ? 0 : (mask[z * stride + x] ? 1 : 0);
    // lattice corner (x,z) sits between cells (x-1,z-1),(x,z-1),(x-1,z),(x,z)
    const reflex = [];
    for (let z = 0; z <= rows; z++) for (let x = 0; x <= stride; x++) {
        const s = at(x - 1, z - 1) + at(x, z - 1) + at(x - 1, z) + at(x, z);
        if (s === 3) reflex.push([x, z]);
    }
    const key = (x, z) => x + "," + z;
    const isReflex = new Set(reflex.map(([x, z]) => key(x, z)));
    // a grid segment between two lattice points is interior when both cells flanking it are inside
    const hOpen = (x, z) => at(x, z - 1) && at(x, z);          // horizontal step from (x,z) to (x+1,z)
    const vOpen = (x, z) => at(x - 1, z) && at(x, z);          // vertical step from (x,z) to (x,z+1)
    const chordsH = [], chordsV = [];
    for (const [x, z] of reflex) {
        for (let e = x; e < stride; e++) {
            if (!hOpen(e, z)) break;
            if (isReflex.has(key(e + 1, z))) { chordsH.push([x, e + 1, z]); break; }
        }
        for (let e = z; e < rows; e++) {
            if (!vOpen(x, e)) break;
            if (isReflex.has(key(x, e + 1))) { chordsV.push([z, e + 1, x]); break; }
        }
    }
    // bipartite crossing graph, then Koenig
    const adj = chordsH.map(([x0, x1, z]) => {
        const out = [];
        for (let j = 0; j < chordsV.length; j++) {
            const [z0, z1, vx] = chordsV[j];
            if (vx >= x0 && vx <= x1 && z >= z0 && z <= z1) out.push(j);
        }
        return out;
    });
    const matchV = new Array(chordsV.length).fill(-1);
    const tryK = (u, seen) => {
        for (const v of adj[u]) {
            if (seen[v]) continue;
            seen[v] = 1;
            if (matchV[v] < 0 || tryK(matchV[v], seen)) { matchV[v] = u; return true; }
        }
        return false;
    };
    let matching = 0;
    for (let u = 0; u < chordsH.length; u++) if (tryK(u, new Array(chordsV.length).fill(0))) matching++;
    const L = chordsH.length + chordsV.length - matching;
    // holes: complement components the border cannot reach
    const seen = new Uint8Array(stride * rows);
    const stack = [];
    for (let x = 0; x < stride; x++) { for (const z of [0, rows - 1]) { const i = z * stride + x; if (!mask[i] && !seen[i]) { seen[i] = 1; stack.push(i); } } }
    for (let z = 0; z < rows; z++) { for (const x of [0, stride - 1]) { const i = z * stride + x; if (!mask[i] && !seen[i]) { seen[i] = 1; stack.push(i); } } }
    while (stack.length) {
        const i = stack.pop(), x = i % stride, z = (i / stride) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= stride || nz >= rows) continue;
            const j = nz * stride + nx;
            if (!mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
    }
    let H = 0;
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] || seen[i]) continue;
        H++;
        seen[i] = 1; stack.push(i);
        while (stack.length) {
            const k = stack.pop(), x = k % stride, z = (k / stride) | 0;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, nz = z + dz;
                if (nx < 0 || nz < 0 || nx >= stride || nz >= rows) continue;
                const j = nz * stride + nx;
                if (!mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
            }
        }
    }
    return { min: reflex.length - L + 1 - H, reflex: reflex.length, chords: L, holes: H };
}

/**
 * Everything above in one call, so two partitions can be put side by side without the caller repeating itself.
 */
export function score(lab, { conn, stride, rows }) {
    return {
        regions: regionCount(lab),
        mutualViolations: mutualViolations(lab, conn, stride, rows),
        ...boundaryStats(lab, conn, stride, rows),
    };
}

/**
 * *** MEASURED, NOT REMEMBERED -- AND EVERY FIELD HERE IS RE-DERIVED BY tools/ship/partitionScore-selfcheck.mjs
 * ON EVERY RUN. *** The record exists so a later round can see which numbers moved, not so a check can compare
 * a number against itself.
 */
export const PARTITION_AT_V4536 = Object.freeze({
    diagonalRects: 737,           // what rectangles() emits on the gate's 45-degree fixture
    diagonalMin: 737,             // and the Lipski/Ohtsuki floor for the same mask -- the sweep is OPTIMAL
    diagonalReflex: 738,
    diagonalHoles: 2,
    diagonalChords: 0,
    ledgeRegions: 2,              // the x-oriented ledge: the mutual test splits it
    ledgeRegionsUnmutual: 1,      // and without the test it does not -- this is the 110 m path up a cliff
    verticalTestWasUngraded: true,  // deleting it left every nav gate green until this round
    tJunctionOutside: 91,         // path samples outside the mesh on a portal one cell too long...
    tJunctionTotal: 427,
    tJunctionMissedByPortalTest: 0, // ...which crossesAllPortals scores as perfect
});
