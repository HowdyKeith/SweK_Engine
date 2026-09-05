// FILE: physics/box3d/rayCast.mjs -- v4382
//
// *** THE PHYSICS WORLD CAN FINALLY BE ASKED WHAT A RAY HITS, AND THIS IS THE PART THAT IS NOT C. ***
//
// physics/box3d/box3d_shim.c gained swk_world_cast_ray this round over box3d's b3World_CastRayClosest. This
// file is the JavaScript side of that: the convention bridge, the row's field names, and the box-to-triangles
// helper that lets a SECOND implementation be pointed at the same geometry.
//
// ---- *** WHY THE TREE NEEDED THIS, COUNTED RATHER THAN ASSERTED *** --------------------------------------------
//
// Ray-versus-geometry code already exists here in three independent places -- mesh/meshBVH.mjs's
// Moller-Trumbore over a BVH, render/perspectiveWarp.mjs, multiplayer/wadLevelHost.js -- and three more
// subsystems ask "what is in front of me" of some other representation: the gaze-dwell picker, the FPS control
// path, and the navmesh. Every one of them answers about a model of the world. None of them could ask the
// world that is actually being simulated, so none of them could agree with it except by luck.
//
// ---- *** THE SEGMENT CONVENTION, AND IT FAILS SILENTLY *** -----------------------------------------------------
//
// box3d takes an ORIGIN and a TRANSLATION. mesh/meshBVH.mjs takes an origin, a DIRECTION and a maxT. Those are
// not the same call with the arguments renamed:
//
//     box3d    cast covers origin -> origin + translation. `fraction` is a fraction OF THE TRANSLATION.
//     meshBVH  cast covers origin -> origin + dir * maxT.  `t` is a distance IN UNITS OF dir.
//
// So a caller who hands box3d a unit direction gets a cast one unit long, which usually hits nothing and
// reports it as an ordinary miss. MEASURED while writing this: a ray at (-10, 0, 0) toward +x with translation
// (20, 0, 0) hits the box at the origin at fraction 0.45; the same ray with translation (5, 0, 0) returns -1,
// no hit, no complaint. That is the whole failure mode -- there is no error to notice, only an absence.
//
// translationFor() and distanceOf() exist so the conversion is written once. A caller that does the multiply
// itself is not wrong; a caller that forgets is silently blind, and this is the file that says so.
"use strict";

/**
 * The row swk_world_cast_ray writes, BY NAME. The WIDTH is not restated here: the shim publishes it through
 * swk_ray_stride(), the same way swk_contact_stride() publishes the contact row's, and the gate asserts that
 * this list and that number agree. Two declarations of a packed layout is the defect the shim's own contact
 * note calls "the eight-defect law waiting to happen".
 */
export const RAY_FIELDS = Object.freeze(["hit", "bodyIndex", "fraction", "px", "py", "pz", "nx", "ny", "nz"]);

/** Read one row into an object. `stride` comes from the shim, never from a constant here. */
export function readRay(row, stride, base = 0) {
    if (!Number.isInteger(stride) || stride < RAY_FIELDS.length) {
        throw new Error(`rayCast: the shim says stride ${stride} and this file names ${RAY_FIELDS.length} fields`);
    }
    const o = {};
    RAY_FIELDS.forEach((k, i) => { o[k] = row[base + i]; });
    o.hit = o.hit !== 0;
    return o;
}

/**
 * A direction and a range as the translation box3d wants. The direction is NOT normalised here: if a caller
 * passes a direction of length 2 and a range of 3, they mean "three lots of that vector", and silently
 * rescaling it would be this file deciding what they meant.
 */
export function translationFor(dir, range) {
    const [dx, dy, dz] = dir;
    return [dx * range, dy * range, dz * range];
}

/** The hit distance in world units: a fraction of the translation, times the translation's length. */
export function distanceOf(fraction, translation) {
    const [tx, ty, tz] = translation;
    return fraction * Math.hypot(tx, ty, tz);
}

/**
 * *** ONE BOX AS TWELVE TRIANGLES, SO A SECOND IMPLEMENTATION CAN BE POINTED AT THE SAME SOLID. ***
 *
 * box3d's swk_body_box builds a b3MakeBoxHull of half-extents at a position. mesh/meshBVH.mjs eats triangles.
 * This is the same box in the other representation -- not an approximation of it: a hull of eight corners has
 * exactly these twelve triangles, and MEASURED, box3d reports the near-face hit at x = -1.0000 for a unit box
 * at the origin, so there is no collision margin to account for either.
 *
 * The winding is counter-clockwise seen from outside, which is what makes the BVH's normal point OUT. That is
 * the second thing the two sides must agree about and the first one a test would not notice, because a
 * reversed winding still returns the right hit POINT and the wrong normal.
 *
 * *** AND THE +y FACE HERE WAS WOUND BACKWARDS, WHICH IS EXACTLY THE SENTENCE ABOVE HAPPENING TO ITS OWN
 * AUTHOR. *** Seven of the round's nine probe rays travelled along x or z; every one agreed with box3d on the
 * body, the distance and the normal. The eighth pointed DOWN, hit the top face, and box3d said the normal was
 * (0, +1, 0) while this table's winding gave (0, -1, 0) -- a 2.0 gap on a unit vector, not a rounding
 * question. The hit POINT and the distance were right in that case too, which is why nothing else noticed.
 * So the gate does not take a ray set on trust: it casts along all six axes and checks every face's derived
 * normal points away from the box centre, which is a claim about the table rather than about the rays.
 *
 * @returns Float64Array(12 * 9), the flat layout MeshBVH's constructor takes
 */
export function boxTriangles(cx, cy, cz, hx, hy, hz) {
    const v = [
        [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
    ];
    // six faces, each two triangles, wound CCW from outside
    const faces = [
        [4, 5, 6, 7],   // +z
        [1, 0, 3, 2],   // -z
        [5, 1, 2, 6],   // +x
        [0, 4, 7, 3],   // -x
        [3, 7, 6, 2],   // +y  -- see the note below: this one was wound backwards and only a ray DOWNWARD found it
        [0, 1, 5, 4],   // -y
    ];
    const tris = new Float64Array(12 * 9);
    let w = 0;
    for (const [a, b, c, d] of faces) {
        for (const t of [[a, b, c], [a, c, d]]) {
            for (const i of t) { tris[w++] = v[i][0]; tris[w++] = v[i][1]; tris[w++] = v[i][2]; }
        }
    }
    return tris;
}

/** Many boxes as one triangle soup, plus the index of the box each triangle came from. */
export function boxesTriangles(boxes) {
    const tris = new Float64Array(boxes.length * 12 * 9);
    const owner = new Int32Array(boxes.length * 12);
    let w = 0, t = 0;
    boxes.forEach((b, n) => {
        const one = boxTriangles(b.x, b.y, b.z, b.hx, b.hy, b.hz);
        tris.set(one, w); w += one.length;
        for (let k = 0; k < 12; k++) owner[t++] = n;
    });
    return { tris, owner };
}
