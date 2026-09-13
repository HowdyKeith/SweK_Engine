// WebGLEngine/physics/character/capsuleMove.mjs -- v4541
//
// *** BACKLOG "terrain-controller" PIECE (2): CAPSULE AGAINST TRIANGLES. *** The entry has read "Not
// started" since v4544 and v4539 proved it is the blocker under piece (3): a downward ray cannot separate a
// doorway from a wall, because the side faces are the entire difference and a vertical ray never touches
// one. The information is in the SWEPT VOLUME. This is that volume.
//
// The separation, driven in the gate on physics/character/groundProbe.mjs's own two fixtures, with ONE rule
// and no oracle at all:
//
//     bridge  (floor, roof at y = 5 over x >= 8)   walks under to x = 20.0000
//     pillar  (floor, solid x in [8,9], z [8,12])  stopped at x =  7.6000  =  8 - radius
//
// Those are the columns v4539 measured as byte-identical from above. A capsule tells them apart on the first
// frame, and it tells them apart because it is the first thing in this tree that asks about a SIDE face.
//
// ---- FOUR THINGS WERE MEASURED BEFORE ANY OF THIS WAS WRITTEN, AND THREE CHANGED THE DESIGN -------------
//
// *** (a) THE CLOSEST-POINT DIRECTION DOES NOT DEGRADE AT THE SURFACE. IT DIES. *** The obvious contact
// normal for a capsule is the direction from the nearest point ON the triangle to the nearest point on the
// capsule's AXIS. It is exact and cheap and it is defined on EXACTLY ONE SIDE of a validity boundary. Driven
// on a floor at y = 0 with radius 0.4, lowering the body:
//
//     axis 0.400 above     distance 0.400   depth 0.000   |direction| 4.0e-1
//     axis 0.010 above     distance 0.010   depth 0.390   |direction| 1.0e-2
//     axis EXACTLY ON      distance 0.000   depth 0.400   |direction| 0
//     axis 0.200 BELOW     distance 0.000   depth 0.400   |direction| 0
//     axis 0.600 BELOW     distance 0.000   depth 0.400   |direction| 0
//
// Once the axis crosses, the direction is the zero vector for EVERY depth beyond -- and the depth SATURATES
// at the radius however deep the body actually is. There is no gradient left to climb out along. A resolver
// that drops a zero-length direction (the natural guard, and the one this file's first draft had) does not
// merely resolve badly there; it resolves NOTHING there, silently, in the one state where resolving matters
// most. So the crossing is the module's stated DOMAIN, `contacts` reports it as `degenerate` rather than
// discarding it, and `moveCapsule` is built to never enter it.
//
// *** (b) THE DOMAIN'S BOUNDARY IS THE RADIUS, EXACTLY. *** Walking east into the pillar with no substeps,
// bisected to nine decimals: an advance of 0.400000000 per frame passes THROUGH four square metres of solid
// stone and ends at x = 31.8; anything below it stops at 7.6. The radius is 0.4. It is not the pillar's
// thickness (1.0) and not a function of speed alone -- and the mechanism is confirmed by counting: ZERO
// zero-direction contacts are dropped on the safe side, TWO on the far side. The dropped contact IS the
// tunnel. So `moveCapsule` caps each substep at a FRACTION OF THE RADIUS, derived, never a constant: at
// 0.5 that is 0.2 for this body, and an advance of 20.0 per frame in 128 substeps stops at 7.6 like every
// other speed.
//
// *** (c) RESOLVING EVERY CONTACT DRIFTS A BODY SIDEWAYS ON A FLAT FLOOR. *** A floor tessellated 10x10 into
// 200 coplanar triangles has 180 interior seams that bound nothing. Pressing a capsule into it and walking
// east 200 frames:
//
//     sink/frame   deepest-first            every contact
//     0.05         z 10.000000, lost 0      z 10.192947, lost 0.0351
//     0.20         z 10.000000, lost 0      z 11.653601, lost 2.5520
//
// 1.65 metres of sideways drift and 2.55 metres of forward progress lost, on a floor with no slope, no wall
// and nothing to slide along. The seam contacts are real -- the neighbour's nearest feature to the axis is
// the shared edge, so its direction is diagonal -- and they are also not surfaces. AND THE USUAL ARGUMENT
// FOR SUMMING THEM DOES NOT HOLD HERE: driven at an inside corner (floor plus a wall at x = 10), deepest-
// first and every-contact agree to the digit, x = 9.600000 and y = 0.000000, because ITERATING re-queries
// and finds the second surface on the next pass. So this resolves the deepest and iterates.
//
// *** (d) AND IT MUST NOT READ THE WINDING, BECAUSE THIS TREE'S OWN FIXTURES ARE WOUND INWARD. *** Every
// floor triangle of groundProbe.mjs's bridge and pillar has a face normal of n.y = -1: straight down, into
// the ground. Pushing a body along its own triangle's normal would drive it through the floor it is standing
// on. Nothing here uses the cross product for a direction -- only the closest-point pair, which is a fact
// about geometry rather than about vertex order.
//
// ---- WHAT THIS IS NOT ------------------------------------------------------------------------------------
//
// NO GRAVITY, NO VELOCITY, NO GROUND CONTRACT. This is depenetration and swept movement against triangles,
// the shape terrainWalk.mjs's header says it does not own. It does not decide what walkable means, it has no
// slope limit and it does not snap to a surface -- a body resting exactly on a floor has depth 0 and is left
// where it is. Piece (1), vertical velocity, is still open and is not this.
//
// AND NOTHING IS WIRED. Piece (3) now has the instrument it was missing and is still not closed: closing it
// means stepTerrain consulting this module instead of an oracle over (x, z), which changes that function's
// contract from "the ground is a height" to "the ground is whatever the body can occupy". That is a round,
// and it is the next one rather than this one.
"use strict";
import { MeshBVH, trianglesFrom, rayTriangle } from "../../mesh/meshBVH.mjs";

/** The tolerance below which a direction is not a direction. Contacts at or under it are DEGENERATE. */
export const DEGENERATE = 1e-12;

/**
 * Closest point on triangle `i` of flat buffer `t` to (px, py, pz). Ericson, Real-Time Collision Detection
 * 5.1.5 -- the seven Voronoi regions of a triangle, in the order that lets each test reuse the last one's
 * dot products. Exact: no iteration, no tolerance, and the gate drives all seven regions against a brute
 * lattice oracle (worst disagreement 4.4e-16 over 400 random points).
 */
export function closestOnTriangle(px, py, pz, t, i) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2];
    const bx = t[i + 3], by = t[i + 4], bz = t[i + 5];
    const cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) return [ax, ay, az, "A"];
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return [bx, by, bz, "B"];
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const s = d1 / (d1 - d3); return [ax + abx * s, ay + aby * s, az + abz * s, "AB"]; }
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return [cx, cy, cz, "C"];
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const s = d2 / (d2 - d6); return [ax + acx * s, ay + acy * s, az + acz * s, "AC"]; }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const s = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return [bx + (cx - bx) * s, by + (cy - by) * s, bz + (cz - bz) * s, "BC"];
    }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
    return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w, "FACE"];
}

/**
 * Closest pair of points between segments [p0,p1] and [q0,q1]. Ericson 5.1.9, including the degenerate
 * branches where either segment is a point -- a capsule whose two sphere centres coincide IS a sphere, and
 * the caller is allowed to build one.
 */
export function closestOnSegments(p0, p1, q0, q1) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const ex = q1[0] - q0[0], ey = q1[1] - q0[1], ez = q1[2] - q0[2];
    const rx = p0[0] - q0[0], ry = p0[1] - q0[1], rz = p0[2] - q0[2];
    const a = dx * dx + dy * dy + dz * dz, e = ex * ex + ey * ey + ez * ez;
    const f = ex * rx + ey * ry + ez * rz;
    const clamp = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
    let s, u;
    if (a <= DEGENERATE && e <= DEGENERATE) { s = 0; u = 0; }
    else if (a <= DEGENERATE) { s = 0; u = clamp(f / e); }
    else {
        const c = dx * rx + dy * ry + dz * rz;
        if (e <= DEGENERATE) { u = 0; s = clamp(-c / a); }
        else {
            const b = dx * ex + dy * ey + dz * ez, den = a * e - b * b;
            s = den !== 0 ? clamp((b * f - c * e) / den) : 0;
            u = (b * s + f) / e;
            if (u < 0) { u = 0; s = clamp(-c / a); }
            else if (u > 1) { u = 1; s = clamp((b - c) / a); }
        }
    }
    return [[p0[0] + dx * s, p0[1] + dy * s, p0[2] + dz * s],
            [q0[0] + ex * u, q0[1] + ey * u, q0[2] + ez * u]];
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Closest pair between segment [a,b] and triangle `i`, exact.
 *
 * *** IT IS THE MINIMUM OVER SIX SUB-PROBLEMS, AND THE SIXTH IS THE ONE THIS FILE'S OWN COMMENT SWORE WAS
 * COVERED BY THE OTHER FIVE. *** The five boundary cases are each endpoint against the triangle (2) and the
 * axis against each triangle edge (3), and the draft that shipped only those carried this justification:
 * "the nearest pair always has at least one member at a boundary unless the segment crosses the triangle, in
 * which case the distance is zero and every one of the five reports zero too". THE SECOND HALF IS FALSE. A
 * segment that pierces the triangle's INTERIOR is near no vertex, no edge and no endpoint -- its distance is
 * zero and all five sub-problems agree it is far away. Driven by the gate's brute oracle on the first run:
 * a = (0.7677, -1.2236, 1.0728), b = (0.1988, 0.5990, -0.2376) crosses the unit triangle at (0.3851, 0.0021,
 * 0.1916), and the five-way minimum answered 0.156763 against a sampled 0.002735.
 *
 * That is a capsule standing with its axis THROUGH a thin wall reporting no contact, which is the exact
 * failure the whole module exists to prevent -- and it survived the bridge, the pillar, the corner and the
 * flat floor, because none of those puts a thin surface across a body's middle.
 *
 * The piercing test is mesh/meshBVH.mjs's own `rayTriangle` rather than a second Moller-Trumbore: that
 * module's header is about there being ONE kernel, and a controller that disagreed with the raycaster about
 * where a triangle is would be worse than either.
 *
 * *** WHY SIX IS ALL OF THEM. *** Distance to a convex set is convex along the segment, so an interior
 * minimum has the closest direction perpendicular to the axis. If the closest feature is a vertex or an
 * edge, cases 3-5 hold it. If it is the FACE, the direction is the face normal, so the axis is parallel to
 * the plane and the distance is constant over the stretch whose shadow lies in the triangle -- attained at a
 * segment endpoint (cases 1-2) or where that shadow crosses an edge (cases 3-5). And an interior minimum of
 * ZERO is the piercing case, which is the sixth.
 *
 * Returns `{ dist, on, at }` -- `on` is the point on the capsule axis, `at` the point on the triangle.
 */
export function segmentTriangle(a, b, t, i) {
    let best = Infinity, on = null, at = null;
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const pierce = rayTriangle(a[0], a[1], a[2], dx, dy, dz, t, i);
    if (pierce !== null && pierce <= 1) {
        const hit = [a[0] + dx * pierce, a[1] + dy * pierce, a[2] + dz * pierce];
        return { dist: 0, on: hit, at: hit };
    }
    for (const p of [a, b]) {
        const q = closestOnTriangle(p[0], p[1], p[2], t, i);
        const d = dist2(p, q);
        if (d < best) { best = d; on = p; at = [q[0], q[1], q[2]]; }
    }
    for (let k = 0; k < 3; k++) {
        const j = i + k * 3, m = i + ((k + 1) % 3) * 3;
        const [p, q] = closestOnSegments(a, b, [t[j], t[j + 1], t[j + 2]], [t[m], t[m + 1], t[m + 2]]);
        const d = dist2(p, q);
        if (d < best) { best = d; on = p; at = q; }
    }
    return { dist: Math.sqrt(best), on, at };
}

/** A capsule: a segment from `foot + radius` to `head - radius`, standing at `pos` with feet on the ground. */
export function capsuleOf(pos, { radius = 0.4, height = 1.8 } = {}) {
    const r = Math.min(radius, height / 2);
    return { pos: pos.slice(), radius: r, height,
             a: [pos[0], pos[1] + r, pos[2]], b: [pos[0], pos[1] + height - r, pos[2]] };
}

/**
 * Every triangle the capsule overlaps, with its depth and push direction.
 *
 * *** A CONTACT WHOSE DIRECTION IS UNDEFINED IS REPORTED, NOT DROPPED. *** See (a) in the header: that state
 * is not a rounding accident, it is the whole interior of the surface, and dropping it is how a body walks
 * through stone. `degenerate` counts them so a caller -- and the gate -- can tell "nothing is touching me"
 * from "I am inside something and cannot tell which way out".
 */
export function contacts(bvh, cap) {
    const r = cap.radius, a = cap.a, b = cap.b;
    const lo = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r];
    const hi = [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r];
    const out = [], degenerate = [];
    for (const tri of bvh.trianglesInBox(lo, hi)) {
        const q = segmentTriangle(a, b, bvh.tris, tri * 9);
        const depth = r - q.dist;
        if (depth <= 0) continue;
        const dx = q.on[0] - q.at[0], dy = q.on[1] - q.at[1], dz = q.on[2] - q.at[2];
        const L = Math.hypot(dx, dy, dz);
        if (L <= DEGENERATE) { degenerate.push({ tri, depth }); continue; }
        out.push({ tri, depth, n: [dx / L, dy / L, dz / L], at: q.at });
    }
    return { hits: out, degenerate };
}

/**
 * Push the capsule out of whatever it overlaps, deepest contact first, re-querying each pass.
 *
 * Deepest-first rather than every-contact for the reason in (c): summing the pushes drifts a body sideways
 * across a flat floor's own interior seams, and iterating recovers the second surface of a corner anyway.
 */
export function depenetrate(bvh, cap, { iterations = 8 } = {}) {
    let passes = 0, deepest = 0, degenerate = 0;
    for (let k = 0; k < iterations; k++) {
        const c = contacts(bvh, cap);
        degenerate += c.degenerate.length;
        if (!c.hits.length) break;
        let best = c.hits[0];
        for (const h of c.hits) if (h.depth > best.depth) best = h;
        deepest = Math.max(deepest, best.depth);
        for (let j = 0; j < 3; j++) {
            cap.pos[j] += best.n[j] * best.depth;
            cap.a[j] += best.n[j] * best.depth;
            cap.b[j] += best.n[j] * best.depth;
        }
        passes = k + 1;
    }
    return { passes, deepest, degenerate, resolved: contacts(bvh, cap).hits.length === 0 };
}

/**
 * Move the capsule by `delta`, substepped so the axis never leaves the domain in (a), depenetrating after
 * each substep.
 *
 * `stride` is the fraction of the RADIUS a substep may advance -- derived from the body, never a constant,
 * because the boundary measured in (b) is the radius itself and a hardcoded cap is a cap that is right for
 * one body. `escaped` is true if any substep still ended with a degenerate contact, which means the domain
 * was left despite the substepping and the result is not trustworthy: it is reported rather than swallowed.
 */
export function moveCapsule(bvh, cap, delta, { stride = 0.5, iterations = 8, maxSubsteps = 4096 } = {}) {
    const want = Math.hypot(delta[0], delta[1], delta[2]);
    const cap0 = [cap.pos[0], cap.pos[1], cap.pos[2]];
    const limit = Math.max(cap.radius * stride, Number.MIN_VALUE);
    const n = Math.min(maxSubsteps, Math.max(1, Math.ceil(want / limit)));
    let degenerate = 0, passes = 0;
    for (let s = 0; s < n; s++) {
        for (let j = 0; j < 3; j++) {
            cap.pos[j] += delta[j] / n; cap.a[j] += delta[j] / n; cap.b[j] += delta[j] / n;
        }
        const d = depenetrate(bvh, cap, { iterations });
        degenerate += d.degenerate; passes += d.passes;
    }
    const moved = [cap.pos[0] - cap0[0], cap.pos[1] - cap0[1], cap.pos[2] - cap0[2]];
    return { pos: cap.pos.slice(), moved, substeps: n, passes, degenerate,
             escaped: degenerate > 0, advance: want / n,
             blocked: want > 0 && Math.hypot(moved[0], moved[1], moved[2]) < want * 0.5 };
}

const quadMesh = (quads) => {
    const pos = [], idx = [];
    for (const q of quads) { const o = pos.length; pos.push(q[0], q[1], q[2], q[3]); idx.push([o, o + 1, o + 2], [o, o + 2, o + 3]); }
    return new MeshBVH(trianglesFrom(pos, idx));
};

/**
 * A PERFECTLY FLAT floor cut into `n` by `n` quads -- 2n^2 coplanar triangles and 2n(n-1) interior seams
 * that bound nothing at all.
 *
 * *** IT IS FLAT ON PURPOSE, WHICH IS WHAT MAKES IT DAMNING. *** Any sideways motion a body picks up here is
 * manufactured by the tessellation, because the surface has no slope to slide down and no wall to slide
 * along. A fixture with a ramp in it would let the artefact hide inside something the body ought to do.
 */
export function tessellatedFloor({ n = 10, span = 20 } = {}) {
    const pos = [], idx = [], id = [];
    for (let j = 0; j <= n; j++) {
        const row = [];
        for (let i = 0; i <= n; i++) { pos.push([i * span / n, 0, j * span / n]); row.push(pos.length - 1); }
        id.push(row);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        idx.push([id[j][i], id[j][i + 1], id[j + 1][i + 1]]);
        idx.push([id[j][i], id[j + 1][i + 1], id[j + 1][i]]);
    }
    return new MeshBVH(trianglesFrom(pos, idx));
}

/**
 * A thin horizontal ledge with NO thickness, at a height that puts it through a standing body's chest.
 *
 * *** THE FIXTURE FOR THE SIXTH SUB-PROBLEM, AND NOTHING ELSE IN THIS FILE CATCHES IT. *** A body at y = 0
 * with radius 0.4 has an axis from 0.4 to 1.4; a ledge at y = 1.0 runs straight through it. The five
 * boundary sub-problems answer 0.400000 -- exactly the radius, so depth 0, so NO CONTACT AT ALL -- while the
 * body is impaled. `at` is off the quad's own diagonal on purpose: on the diagonal the axis touches a
 * triangle EDGE and the five find it, which is how a fixture can accidentally pass for the wrong reason.
 */
export function thinLedge({ span = 20, y = 1 } = {}) {
    return quadMesh([[[0, y, 0], [span, y, 0], [span, y, span], [0, y, span]]]);
}

/** Floor plus a wall across it: two surfaces a body must obey AT ONCE, which is the case that argues for
 *  summing every contact -- and, measured, does not need it. */
export function insideCorner({ span = 20, wallX = 10, wallY = 5 } = {}) {
    return quadMesh([
        [[0, 0, 0], [span, 0, 0], [span, 0, span], [0, 0, span]],
        [[wallX, 0, 0], [wallX, wallY, 0], [wallX, wallY, span], [wallX, 0, span]],
    ]);
}

/**
 * *** RE-DERIVED BY tools/ship/capsuleMove-selfcheck.mjs ON EVERY RUN. *** Readings of this tree at v4541.
 */
export const CAPSULE_AT_V4541 = Object.freeze({
    bridgeX: 20,                // walks under the overhang the ground oracle reads as a wall
    pillarX: 7.6,               // and is stopped by the solid one, at x0 minus the radius
    pillarStopIsRadius: true,   // 8 - 0.4, so the stop is the body's own size rather than a tuned number
    radius: 0.4,
    tunnelAdvance: 0.4,         // the first per-frame advance that passes through the pillar -- the radius
    safeAdvance: 0.2,           // and one that does not
    droppedAtSafe: 0,           // zero-direction contacts discarded on the safe side
    droppedAtTunnel: 2,         // ...and on the far side. The dropped contact IS the tunnel.
    fastAdvance: 20,            // 20 metres in one call, substepped by the radius rule
    fastSubsteps: 100,          // ...into advances of 0.2 -- the safe number above, derived not typed
    seamDriftDeepest: 0,        // metres of sideways drift across a FLAT tessellated floor, deepest-first
    cornerX: 9.6,               // an inside corner: stopped at the wall minus the radius
    inwardWoundFloors: true,    // every floor triangle in both fixtures has n.y = -1
    ledgeFiveWay: 0.4,          // what the five boundary sub-problems answer for an IMPALED body: the radius
    ledgeSixWay: 0,             // ...and what the piercing test answers. Depth 0 against depth 0.4.
    ledgeAt: [12, 0, 5],        // off the quad's diagonal, where the five would find the edge and look right
});
