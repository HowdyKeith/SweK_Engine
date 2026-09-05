// WebGLEngine/voxel/shipyard.mjs -- v4388
//
// *** A MOVING VOXEL BODY WHOSE BLOCKS NEVER MOVE. ***
//
// Keith raised ValkyrienSkies/Valkyrien-Skies-2 (LGPL-3.0, Java + Kotlin, Minecraft 1.20.1), whose central
// trick is worth more than the mod: THE SHIPYARD. A ship's blocks are not stored where the ship appears. They
// live axis-aligned on the integer grid, in a ChunkClaim of 512 chunks, millions of blocks from world spawn,
// and are PROJECTED into the world by a pose. Every interaction -- a click, a ray, a collision point -- is
// transformed BACK into shipyard space and answered there, on a grid that has never been touched. The blocks
// go on believing they are axis-aligned, so every system that assumes a grid keeps working unmodified.
//
// This tree already had both halves and never the indirection: voxel/voxelDDA.js traverseDDA is Amanatides &
// Woo on an axis-aligned grid, and box3d carries rigid bodies. THIS FILE IS ONLY THE INDIRECTION, and it owns
// no traversal of its own -- it transforms the ray and hands it to the one marcher this tree already has.
//
// ---- *** WHAT THE INDIRECTION ACTUALLY BUYS, AND IT IS NOT SPEED *** ------------------------------------------
//
// There are two ways to move a voxel body and they are NOT equivalent in floating point:
//
//   BAKE      transform the voxel POSITIONS into world space and march the ray in world space. Every motion
//             re-transforms the data, so error accumulates IN THE STORED GEOMETRY and compounds forever.
//   SHIPYARD  keep the integer coordinates and transform only the RAY. The error lives in the query, is
//             re-derived from the pose every frame, and NEVER COMPOUNDS -- the grid is bit-identical after any
//             number of motions because nothing ever writes to it.
//
// The measured difference is in tools/ship/shipyard-selfcheck.mjs, and it is not subtle.
//
// ---- *** AND THE FLOAT32 WALL, WHICH IS WHERE THIS DESIGN MEETS A WEB ENGINE'S ACTUAL CONSTRAINT *** ----------
//
// A float32 has 24 bits of mantissa, so its spacing at x is 2^(floor(log2 x) - 23): 1.0 at x = 2^23 = 8,388,608.
// A claim span of CHUNK * CLAIM_CHUNKS = 8192 voxels puts claim index 1024 exactly on that wall. VS2 says
// "millions of blocks from world spawn" and Minecraft's server is float64; every vertex buffer in a WebGL or
// WebGPU tree is float32. A shipyard address at a few million voxels is not representable there.
//
// *** THE RESOLUTION IS THAT NOTHING EVER RENDERS AT THE SHIPYARD ADDRESS. *** A body's mesh goes to the GPU in
// CLAIM-LOCAL coordinates -- 0..8192, where float32 spacing is 2^-10 -- with the pose as a uniform matrix. The
// far-away location is safe precisely because it is never a vertex. So this module hands out claim-local
// coordinates for rendering and refuses to hand out an absolute one, and the gate holds it to that.
//
// ---- *** v4390 -- TWO CORRECTIONS TO THE PARAGRAPH ABOVE, BOTH MEASURED *** -----------------------------------
//
// (1) "EXACT" MEANT STORED, NOT RENDERED, AND v4388's NOTE DID NOT SAY WHICH. The claim-local coordinate is
// exactly representable in float32 and stays so forever -- that stands. Taken all the way to eye-relative space
// through a rotation and three float32 accumulations, the worst vertex is 6.3e-6 of a voxel out. Small, flat in
// distance, and NOT ZERO; a reader who took "exact" to mean "exact through the pipeline" was wrong by that much.
//
// (2) THE STANDARD ALTERNATIVE WAS MEASURED AND IT IS NOT A FIX. "Render relative to eye" -- keep the world
// coordinate and difference the camera in float64 -- buys a factor of about 2.2 and no more, at every distance
// from a thousand to eight million, because it removes the CANCELLATION in the matrix multiply and cannot touch
// the QUANTISATION already in the stored coordinate. Its residual sits at 0.54 of a float32 spacing: the vertex
// buffer holds a world number and the nearest representable one is half a spacing away before any arithmetic.
// BOTH REAL FIXES CHANGE THE STORAGE. Double-single (a high/low float32 pair, Cesium's trick) matches the
// shipyard to within 1.4x, so the choice is COST: this module needs a per-body origin and a pose, which a moving
// body already has; double-single needs twice the attribute bytes and no pose, which is what STATIC far terrain
// can use and a shipyard has nothing to offer.

/** VS2's own two numbers, kept as its own two numbers rather than multiplied into one. */
export const CHUNK = 16;
export const CLAIM_CHUNKS = 512;
export const CLAIM_SPAN = CHUNK * CLAIM_CHUNKS;      // 8192 voxels along each claim edge

/** float32 spacing at x -- the distance to the next representable value. 1.0 at 2^23. */
export function f32Spacing(x) {
    const a = Math.abs(x);
    if (!Number.isFinite(a)) return Infinity;
    if (a === 0) return 2 ** -149;
    const e = Math.floor(Math.log2(a));
    return e < -126 ? 2 ** -149 : 2 ** (e - 23);
}

/**
 * How many claims fit before float32 can no longer resolve `voxelFraction` of a voxel at the claim's far edge.
 * Reported rather than enforced: the answer for a renderer that only ever sees claim-local coordinates is
 * "all of them", and the number below is what you lose the moment you bake the address into a vertex.
 */
export function claimsWithinF32(voxelFraction = 1) {
    let n = 1;
    while (f32Spacing((n + 1) * CLAIM_SPAN) <= voxelFraction && n < 1 << 20) n++;
    return n;
}

/** Claim `id`'s origin: a straight line along +X, VS2's own layout, one claim per body, never overlapping. */
export function claimFor(id) {
    if (!Number.isInteger(id) || id < 0) throw new Error("shipyard: a claim id is a non-negative integer");
    return { ox: id * CLAIM_SPAN, oy: 0, oz: 0 };
}

/**
 * A pose is a rotation (unit quaternion) and a world position for the claim's LOCAL ORIGIN. Kept as data rather
 * than a matrix because the round trip has to invert it exactly, and inverting a unit quaternion is a conjugate.
 */
export function pose({ id = 0, position = [0, 0, 0], quaternion = [0, 0, 0, 1], scale = 1 } = {}) {
    const [qx, qy, qz, qw] = quaternion;
    const n = Math.hypot(qx, qy, qz, qw) || 1;
    return Object.freeze({ id, claim: claimFor(id), position: [...position], scale,
                           quaternion: [qx / n, qy / n, qz / n, qw / n] });
}

const rotate = (q, v) => {
    // v + 2 * cross(qv, cross(qv, v) + qw * v) -- the standard sandwich, no matrix built
    const [x, y, z, w] = q, [vx, vy, vz] = v;
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];

/** Claim-local (0..CLAIM_SPAN) -> world. This is the ONLY direction a renderer needs. */
export function localToWorld(p, po) {
    const r = rotate(po.quaternion, [p[0] * po.scale, p[1] * po.scale, p[2] * po.scale]);
    return [r[0] + po.position[0], r[1] + po.position[1], r[2] + po.position[2]];
}

/** World -> claim-local. This is the direction every INTERACTION needs. */
export function worldToLocal(p, po) {
    const d = [p[0] - po.position[0], p[1] - po.position[1], p[2] - po.position[2]];
    const r = rotate(conj(po.quaternion), d);
    return [r[0] / po.scale, r[1] / po.scale, r[2] / po.scale];
}

/** Claim-local -> the absolute shipyard address. FOR STORAGE AND LOOKUP ONLY -- never for a vertex. */
export function localToShipyard(p, po) { return [p[0] + po.claim.ox, p[1] + po.claim.oy, p[2] + po.claim.oz]; }
export function shipyardToLocal(p, po) { return [p[0] - po.claim.ox, p[1] - po.claim.oy, p[2] - po.claim.oz]; }

/**
 * A world-space ray, answered on the untouched grid.
 *
 * The ray is transformed into claim-local space and handed to voxelDDA's traverseDDA -- THE ONE MARCHER THIS
 * TREE HAS, imported rather than reimplemented. `isSolid` is called with CLAIM-LOCAL integer coordinates, so a
 * caller's storage never learns that its body moved. `t` comes back in world units: the local march is in
 * voxels, and dividing the direction by `scale` is what keeps the two agreeing.
 */
export function raycast(originWorld, dirWorld, po, isSolid, maxSteps = 256, traverse = null) {
    if (typeof traverse !== "function") throw new Error("shipyard: raycast needs voxelDDA's traverseDDA passed in");
    const o = worldToLocal(originWorld, po);
    // A DIRECTION IS ROTATED, NEVER TRANSLATED -- the commonest way to get this wrong, and it reads correct.
    const d = rotate(conj(po.quaternion), dirWorld);
    const hit = traverse(o[0], o[1], o[2], d[0], d[1], d[2], isSolid, maxSteps);
    if (!hit.hit) return { ...hit, world: null };
    return { ...hit, t: hit.t * po.scale,
             world: localToWorld([hit.vx + 0.5, hit.vy + 0.5, hit.vz + 0.5], po),
             normalWorld: rotate(po.quaternion, [hit.nx, hit.ny, hit.nz]) };
}

const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

/**
 * Move a body: compose a delta rotation and translation onto its pose.
 *
 * *** THE POSE ACCUMULATES ERROR AND THE GRID DOES NOT, WHICH IS THE ENTIRE POINT. *** Ten thousand of these
 * leave the quaternion a little off unit -- so it is renormalised here, which is a bounded correction on four
 * numbers. The alternative design has to correct the same drift on every voxel it stores, and cannot, because
 * there is nothing to renormalise a moved voxel centre back to.
 */
export function advance(po, { deltaQuaternion = [0, 0, 0, 1], deltaPosition = [0, 0, 0] } = {}) {
    return pose({ id: po.id, scale: po.scale, quaternion: qmul(deltaQuaternion, po.quaternion),
                  position: [po.position[0] + deltaPosition[0], po.position[1] + deltaPosition[1],
                             po.position[2] + deltaPosition[2]] });
}

/* ------------------------------------------------------------------------------------------------------------
 * v4390 -- THE TWO RIVAL ENCODINGS, HERE TO BE MEASURED AGAINST RATHER THAN USED.
 *
 * v4388 shipped this module and named its own unchecked item: whether a CAMERA-RELATIVE render is the better
 * fix for float32 at distance. It is the standard answer -- "render relative to eye" -- and the gate now
 * measures it beside the other two. Both encodings live here rather than in the gate because a claim in this
 * file's own header is what they test, and a rival implemented inside the check that judges it is not a rival.
 * --------------------------------------------------------------------------------------------------------- */

/** CAMERA-RELATIVE (relative-to-eye): the vertex stays a world coordinate, the eye is subtracted in f64. */
export function eyeRelative(vWorld, eye) {
    const f = Math.fround;
    return [f(f(vWorld[0]) - eye[0]), f(f(vWorld[1]) - eye[1]), f(f(vWorld[2]) - eye[2])];
}

/**
 * DOUBLE-SINGLE: a world coordinate carried as a high/low pair of float32s, the trick Cesium uses for a globe.
 * Differencing two split values recovers the precision a single float32 lost, at twice the attribute bytes.
 */
export function splitDouble(x) { const f = Math.fround, hi = f(x); return [hi, f(x - hi)]; }
export function splitDifference(a, b) {
    const f = Math.fround, [ah, al] = splitDouble(a), [bh, bl] = splitDouble(b);
    return f(f(ah - bh) + f(al - bl));
}

/**
 * The BAKE alternative, here so the comparison is real code rather than an argument. Applies a pose to a list of
 * voxel centres and returns the moved centres -- which is what a tree without a shipyard has to store.
 */
export function bake(centres, po) { return centres.map((c) => localToWorld(c, po)); }
