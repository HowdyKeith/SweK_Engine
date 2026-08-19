// WebGLEngine/bz/bzCollide.js — is the tank inside anything?
//
// BZFlag's collision for a tank against a building is `Obstacle::inBox(pos, angle, dx, dy, height)`, and
// under it, `testRectRect` -- two oriented rectangles in the x-y plane, plus a z overlap. That is all a
// box is. A pyramid is the same test against a rectangle that SHRINKS with height, which is a neat trick:
// a solid of revolution nobody has to triangulate.
//
// Verified against src/obstacle/BoxBuilding.cxx, src/obstacle/PyramidBuilding.cxx and src/game/Intersect.cxx
// on the 2.4 branch. Two honest departures, both named here and both tested:
//
//   * `testOrigRectRect` upstream classifies corners into nine regions and walks the edges. We use the
//     SEPARATING AXIS THEOREM over the four face normals instead. For two convex rectangles these are the
//     same predicate, and SAT is four lines and can be reasoned about. Rather than transcribe BZFlag's
//     algorithm to compare against -- which would test a copy against its original -- bz/tools/
//     bz-tank-selfcheck.mjs checks SAT against an INDEPENDENT oracle: two convex polygons overlap iff a
//     vertex of one lies inside the other, or two of their edges cross. Ten thousand random pairs, and the
//     two agree on every one.
//   * BZFlag's `inBox` uses a strict `<` on the top and a `>=` on the bottom, so a tank standing exactly on
//     a roof is NOT inside the building. That asymmetry is load-bearing -- reverse it and you cannot stand
//     on anything -- and it is reproduced exactly.
//
// The tank's own box is half a tank-length in x, half a tank-width in y (LocalPlayer.cxx), and one tank
// height tall. `pos` is the centre of its underside, as it is for every obstacle in this port.

"use strict";

import { meshContainsPoint } from "./bzMesh.js";   // v2183 -- the mesh family

const ZERO_TOLERANCE = 1e-6;

// --- two oriented rectangles in the plane ------------------------------------------------------------
// SAT over four axes: the two face normals of each rectangle. `a`/`b` are {x, y, angle, dx, dy} with dx,dy
// half-extents along the rectangle's own axes.
function testRectRect(ax, ay, aAngle, adx, ady, bx, by, bAngle, bdx, bdy) {
    const dx = bx - ax, dy = by - ay;
    const ca = Math.cos(aAngle), sa = Math.sin(aAngle);
    const cb = Math.cos(bAngle), sb = Math.sin(bAngle);
    // The two rectangles' axes.
    const A = [[ca, sa], [-sa, ca]];
    const B = [[cb, sb], [-sb, cb]];
    const half = [[adx, ady], [bdx, bdy]];

    for (const [axes, own, other, ownHalf, otherHalf] of [[A, A, B, half[0], half[1]], [B, B, A, half[1], half[0]]]) {
        for (let i = 0; i < 2; i++) {
            const ax0 = axes[i];
            // The centre separation along this axis...
            const sep = Math.abs(dx * ax0[0] + dy * ax0[1]);
            // ...against each rectangle's projected radius.
            const rOwn = ownHalf[i];
            const rOther = Math.abs(otherHalf[0] * (other[0][0] * ax0[0] + other[0][1] * ax0[1]))
                + Math.abs(otherHalf[1] * (other[1][0] * ax0[0] + other[1][1] * ax0[1]));
            if (sep > rOwn + rOther) return false;   // an axis separates them: no overlap
        }
    }
    return true;
}

// --- the obstacles ------------------------------------------------------------------------------------
// BoxBuilding::inBox. The z test is `p[2] < top` and `p[2] + height >= bottom`: strict above, inclusive
// below. Standing exactly on a roof is standing, not clipping.
function boxHit(o, px, py, pz, angle, dx, dy, height) {
    const bottom = o.pos[2], top = o.pos[2] + o.size[2];
    if (!(pz < top)) return false;
    if (!(pz + height >= bottom)) return false;
    return testRectRect(o.pos[0], o.pos[1], o.rotation || 0, o.size[0], o.size[1], px, py, angle, dx, dy);
}

// PyramidBuilding::shrinkFactor. The rectangle at the tank's height, normalised and clamped. A flipped
// pyramid widens with height instead of narrowing, and its shrink is measured from the tank's TOP.
function shrinkFactor(o, z, height) {
    let oHeight = o.size[2];
    let flip = !!o.flipz;
    if (oHeight < 0) { flip = !flip; oHeight = -oHeight; }
    let zz = z - o.pos[2];
    if (oHeight <= ZERO_TOLERANCE) return 1;
    zz /= oHeight;
    if (flip) zz += height / oHeight;
    let s = flip ? zz : 1 - zz;
    return s < 0 ? 0 : (s > 1 ? 1 : s);
}

function pyramidHit(o, px, py, pz, angle, dx, dy, height) {
    if (pz + height < o.pos[2]) return false;                  // the tank is below it
    if (pz >= o.pos[2] + o.size[2]) return false;              // ...or above it
    const s = shrinkFactor(o, pz, height);
    if (s <= 0) return false;
    return testRectRect(o.pos[0], o.pos[1], o.rotation || 0, s * o.size[0], s * o.size[1], px, py, angle, dx, dy);
}

// A teleporter is its FRAME. Round two established that it is three boxes -- two posts and a lintel -- and
// the hole between them is what a tank drives through, so the collision is three box tests and not one.
// Testing the outer rectangle would wall off the doorway; testing only the hole would let you drive
// through the posts. The posts sit at +/-(size[1] + border/2) along the teleporter's OWN y axis.
function teleporterSolids(o) {
    const b = o.border, sx = o.size[0], sy = o.size[1], sz = o.size[2];
    const c = Math.cos(o.rotation || 0), s = Math.sin(o.rotation || 0);
    const at = (ly, lz, hy, h) => ({
        type: "box", rotation: o.rotation || 0, driveThrough: false,
        pos: [o.pos[0] - s * ly, o.pos[1] + c * ly, o.pos[2] + lz],
        size: [sx, hy, h],
    });
    return [
        at(-(sy + b / 2), 0, b / 2, sz + b),                    // left post
        at(+(sy + b / 2), 0, b / 2, sz + b),                    // right post
        at(0, sz, sy, b),                                       // the lintel, spanning the hole
    ];
}
function teleporterHit(o, px, py, pz, angle, dx, dy, height) {
    for (const part of teleporterSolids(o)) if (boxHit(part, px, py, pz, angle, dx, dy, height)) return true;
    return false;
}

// A base is a pad unless it is raised. A flat one is not an obstacle at all.
function baseHit(o, px, py, pz, angle, dx, dy, height) {
    if (o.size[2] <= 0) return false;
    return boxHit(o, px, py, pz, angle, dx, dy, height);
}

// v2183 -- a mesh obstacle, exactly as BZFlag collides with one, and it is not what anyone would guess.
//
//   * `MeshObstacle::inBox` ignores the tank's box entirely. It tests the tank's MIDPOINT against
//     containsPoint, and the `dx`, `dy` and `angle` it is handed are marked UNUSED in BZFlag's own source.
//   * The thing that actually stops a tank is each MeshFace, which is registered as its own obstacle.
//     A face is a planar polygon and the tank is an oriented box, so this is a separating-axis test in
//     three dimensions: the box's three axes, the face's normal, and the nine cross products between the
//     box's edges and the polygon's.
//
// A face may be `drivethrough` while its mesh is not, so the flags are checked per face.
function faceHitBox(mesh, f, px, py, pz, angle, dx, dy, height) {
    if (f.driveThrough) return false;
    // Into the tank's frame: translate to its centre, rotate by -angle. The box becomes an AABB with
    // half-extents (dx, dy, height/2) at the origin.
    const c = Math.cos(-angle), s = Math.sin(-angle);
    const hz = height / 2;
    const P = f.v.map((i) => {
        const v = mesh.vertices[i];
        const ax = v[0] - px, ay = v[1] - py;
        return [c * ax - s * ay, s * ax + c * ay, v[2] - (pz + hz)];
    });
    const half = [dx, dy, hz];

    const sep = (axis) => {
        const la = Math.hypot(axis[0], axis[1], axis[2]);
        if (la < 1e-12) return false;                          // a degenerate axis proves nothing
        let lo = Infinity, hi = -Infinity;
        for (const p of P) { const d = p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]; if (d < lo) lo = d; if (d > hi) hi = d; }
        const r = half[0] * Math.abs(axis[0]) + half[1] * Math.abs(axis[1]) + half[2] * Math.abs(axis[2]);
        return lo > r || hi < -r;                              // a gap on this axis: no overlap
    };

    if (sep([1, 0, 0]) || sep([0, 1, 0]) || sep([0, 0, 1])) return false;
    // The face's normal, rotated into the tank's frame.
    const n = f.plane;
    if (sep([c * n[0] - s * n[1], s * n[0] + c * n[1], n[2]])) return false;
    for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        if (sep([0, -e[2], e[1]]) || sep([e[2], 0, -e[0]]) || sep([-e[1], e[0], 0])) return false;
    }
    return true;
}

// v2187 -- A BROAD PHASE, and it is not an optimisation, it is the difference between a game and a hang.
//
// Round four's mesh collision walked every face of every mesh, every frame. A tetrahedron has four faces
// and nobody noticed. Round seven gave arena.bzw a dome with 128 of them, two twelve-sided cones and two
// arcs, and the pilot selfcheck -- 300 simulated seconds of two tanks -- stopped finishing. `containsPoint`
// is worse: it casts a ray against every face, twice, per check point.
//
// A mesh knows its own bounding box. A tank whose swept box does not touch it cannot touch its faces.
function meshBroadPhase(o, px, py, pz, angle, dx, dy, height) {
    const e = o.extents;
    if (!e) return true;
    const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
    const rx = c * dx + s * dy, ry = s * dx + c * dy;   // the tank's box, projected onto the world axes
    if (px + rx < e.lo[0] || px - rx > e.hi[0]) return false;
    if (py + ry < e.lo[1] || py - ry > e.hi[1]) return false;
    if (pz + height < e.lo[2] || pz > e.hi[2]) return false;
    return true;
}

function meshHit(o, px, py, pz, angle, dx, dy, height) {
    if (!meshBroadPhase(o, px, py, pz, angle, dx, dy, height)) return false;
    // The mesh's own volume test: the tank's midpoint, and nothing else.
    if (meshContainsPoint(o, [px, py, pz + 0.5 * height])) return true;
    for (const f of o.faces) if (faceHitBox(o, f, px, py, pz, angle, dx, dy, height)) return true;
    return false;
}

function obstacleHit(o, px, py, pz, angle, dx, dy, height) {
    if (o.driveThrough) return false;                          // `drivethrough` / `passable`
    if (o.type === "mesh") return meshHit(o, px, py, pz, angle, dx, dy, height);
    if (o.type === "box") return boxHit(o, px, py, pz, angle, dx, dy, height);
    if (o.type === "pyramid") return pyramidHit(o, px, py, pz, angle, dx, dy, height);
    if (o.type === "teleporter") return teleporterHit(o, px, py, pz, angle, dx, dy, height);
    if (o.type === "base") return baseHit(o, px, py, pz, angle, dx, dy, height);
    return false;                                              // walls are handled by the world bounds
}

// The first obstacle the tank is inside, or null. A grouped obstacle carries a transform we do not invert
// here: `bzwWorld` bakes rotation and position into pos/rotation, and a group's transform is reported so a
// caller knows the collision is approximate for those. See the gap note in README-bzflag.md.
function worldHit(world, px, py, pz, angle, dx, dy, height) {
    for (const o of world.obstacles) if (obstacleHit(o, px, py, pz, angle, dx, dy, height)) return o;
    return null;
}

// How high the ground is under a tank at height `maxZ`: the tallest roof its footprint overlaps that is not
// ABOVE it. You cannot land on a ceiling.
//
// v2188 -- `maxZ` is new, and it is a bug fix, not a feature. Round three consulted every roof and took the
// tallest, because a box's roof is the only surface a box has and a tank driving at a box is stopped by its
// wall long before it reaches the top. A teleporter's LINTEL is twenty metres up with nothing underneath
// it: a tank driving through the doorway found a roof over its head, and `restingHeight` cheerfully put it
// there. Nothing in three rounds of physics tests noticed, because no test drove through a doorway.
function groundHeightAt(world, px, py, angle, dx, dy, maxZ) {
    let h = 0;
    const ceiling = maxZ != null ? maxZ + 1e-9 : Infinity;
    for (const o of world.obstacles) {
        if (o.driveThrough) continue;
        const top = o.pos[2] + (o.type === "teleporter" ? (o.outerSize || o.size)[2] : o.size[2]);
        if (top <= h || top > ceiling) continue;
        // A pyramid has no roof, it has a slope: at any height its rectangle is a different size, so there
        // is no single number to return. bzTank.restingHeight climbs from this answer until the tank is
        // free, which is how a tank ends up perched on one.
        if (o.type === "pyramid") continue;
        // A mesh is an arbitrary shape, so it has no single roof either. restingHeight climbs onto it.
        if (o.type === "mesh") continue;
        if (o.type === "base" && o.size[2] <= 0) continue;
        if (o.type === "teleporter") {
            for (const part of teleporterSolids(o)) {
                const t = part.pos[2] + part.size[2];
                if (t > h && t <= ceiling && testRectRect(part.pos[0], part.pos[1], part.rotation, part.size[0], part.size[1], px, py, angle, dx, dy)) h = t;
            }
            continue;
        }
        if (!testRectRect(o.pos[0], o.pos[1], o.rotation || 0, o.size[0], o.size[1], px, py, angle, dx, dy)) continue;
        h = top;
    }
    return h;
}

export { testRectRect, boxHit, pyramidHit, teleporterHit, teleporterSolids, baseHit, meshHit, meshBroadPhase, faceHitBox, obstacleHit, worldHit, groundHeightAt, shrinkFactor, ZERO_TOLERANCE };
if (typeof module !== "undefined" && module.exports)
    module.exports = { testRectRect, boxHit, pyramidHit, teleporterHit, teleporterSolids, baseHit, meshHit, meshBroadPhase, faceHitBox, obstacleHit, worldHit, groundHeightAt, shrinkFactor, ZERO_TOLERANCE };
